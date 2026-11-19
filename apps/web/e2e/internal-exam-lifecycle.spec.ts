/**
 * E2E spec — Internal Exam end-to-end lifecycle.
 *
 * Covers: admin issues a code from the sitting page (a service-role seed creates the open
 * sitting and its roster entry) → student starts → submits → views report →
 * sees the attempt listed in My Reports → admin opens the attempt report;
 * unknown and missing session ids are refused on the admin report.
 *
 * Seed dependency: the CI seed (apps/web/scripts/seed-e2e.ts) creates a MET exam_config which
 * `start_internal_exam_session` reuses (same time/total/passmark fields).
 * This spec assumes the existing admin and internal-exam student fixtures
 * (admin@lmsplus.local + INTERNAL_EXAM_STUDENT_EMAIL) are loaded; it does not seed its own users.
 *
 * NOTE: requires migrations 057a..065 (internal_exam_codes table, RPCs
 *       start_internal_exam_session / complete_internal_exam_session) to be applied. Until then the
 *       Server Action calls will fail and these specs will not pass.
 *
 * Auth: uses `e2e/.auth/admin.json` and `e2e/.auth/internal-exam-student.json`.
 * The default `test.use({ storageState })` pins the page to admin; we open a
 * second context with the dedicated internal-exam student state for the
 * student half of the flow. (Using user.json would race against
 * session-rotation invalidation from the prior `e2e` project's specs.)
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { signInAsAdmin } from './helpers/admin-supabase'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { insertLegacyCodeFor, seedSittingFor } from './helpers/sitting-code'
import {
  cleanupInternalExamStudentActiveSessions,
  getAdminClient,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'

// Default to admin storage; we open a separate student context inside each test.
test.use({ storageState: 'e2e/.auth/admin.json' })

const SUBJECT_LABEL_FRAGMENT = 'Meteorology'

const SITTINGS_BASE = '/app/admin/internal-exams/sittings'

/** Admin issues the person's code from the sitting page (row menu, Issue codes popup) and reads it from the roster. */
async function issueCodeFromSittingPage(
  adminPage: Page,
  seed: { sittingId: string; studentName: string },
): Promise<string> {
  await adminPage.goto(`${SITTINGS_BASE}/${seed.sittingId}`)
  const row = adminPage.getByRole('row').filter({ hasText: seed.studentName })
  await expect(row).toBeVisible()
  await adminPage.getByRole('button', { name: `Actions for ${seed.studentName}` }).click()
  await adminPage.getByRole('menuitem', { name: 'Issue codes' }).click()
  const dialog = adminPage.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Issue 1 code' }).click()
  await expect(dialog).toHaveCount(0)
  await adminPage.getByRole('button', { name: `Show exams for ${seed.studentName}` }).click()
  const code = (await adminPage.locator('code').first().textContent())?.trim()
  if (!code) throw new Error('roster showed no code after issuing')
  return code
}

const UNKNOWN_SESSION_ID = '00000000-0000-4000-8000-00000000e2e4'

async function expectAttemptsTab(adminPage: Page): Promise<void> {
  await expect(adminPage).toHaveURL(/\/app\/admin\/internal-exams\?tab=attempts$/)
  await expect(adminPage.getByRole('heading', { name: 'Internal Exams' })).toBeVisible()
  await expect(adminPage.getByTestId('tab-attempts')).toHaveAttribute('aria-selected', 'true')
}

/** Admin opens the submitted attempt from the Attempts tab; the report survives a reload. */
async function assertAdminAttemptReport(adminPage: Page, sessionId: string): Promise<void> {
  await adminPage.goto('/app/admin/internal-exams?tab=attempts')
  await expectAttemptsTab(adminPage)
  await adminPage.locator(`a[href="/app/admin/internal-exams/report?session=${sessionId}"]`).click()

  const reportUrl = new RegExp(`/app/admin/internal-exams/report\\?session=${sessionId}$`)
  await expect(adminPage).toHaveURL(reportUrl)
  await expect(
    adminPage.getByRole('main').getByRole('link', { name: 'Internal Exams', exact: true }),
  ).toBeVisible()
  await expect(adminPage.getByText(/^(Passed|Failed)$/)).toBeVisible()
  await expect(adminPage.getByRole('heading', { name: 'Question Breakdown' })).toBeVisible()
  await expect(adminPage.getByRole('img', { name: /^(Correct|Incorrect)$/ }).first()).toBeVisible()

  await adminPage.reload()
  await expect(adminPage).toHaveURL(reportUrl)
  await expect(adminPage.getByRole('heading', { name: 'Question Breakdown' })).toBeVisible()
  await expect(adminPage.getByRole('img', { name: /^(Correct|Incorrect)$/ }).first()).toBeVisible()
}

async function openStudentContext(browser: BrowserContext['browser']): Promise<{
  context: BrowserContext
  page: Page
}> {
  if (!browser) throw new Error('browser is null')
  const context = await browser.newContext({
    storageState: 'e2e/.auth/internal-exam-student.json',
  })
  // Manually-created contexts don't inherit the global `trace` setting from
  // playwright.config.ts. Start tracing explicitly so student-side failures
  // are debuggable in CI artifacts — see issue #587. Swallow the
  // "already started" error that can fire on Playwright retry.
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true }).catch(() => {})
  const page = await context.newPage()
  return { context, page }
}

test.describe('internal exam — lifecycle', () => {
  test.setTimeout(120_000)
  // Void any active session left over from a prior test before each run.
  // See issue #587 — stale sessions cascade and block start_internal_exam_session.
  test.beforeEach(async () => {
    const adminClient = await signInAsAdmin()
    await cleanupInternalExamStudentActiveSessions(adminClient)
    await cleanupE2eExamSittings()
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await cleanupE2eExamSittings()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    // Voids a redeemed legacy code (ends its session), then soft-deletes legacy codes.
    try {
      await cleanupInternalExamStudentActiveSessions(await signInAsAdmin())
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('admin issues code, student starts + submits, attempt appears in My Reports and the admin report', async ({
    page: adminPage,
    context: adminCtx,
  }) => {
    // ── 1. Admin issues a code from an open sitting holding the student ─────
    const seed = await seedSittingFor({
      studentEmail: INTERNAL_EXAM_STUDENT_EMAIL,
      subjectFragment: SUBJECT_LABEL_FRAGMENT,
      status: 'open',
      withCode: false,
    })
    const code = await issueCodeFromSittingPage(adminPage, seed)
    expect(code).toMatch(/^[A-HJKLMNPQRSTUVWXYZ23456789]{8}$/)

    // ── 2. Student logs in via separate context (internal-exam-student.json) ─
    const { context: studentCtx, page } = await openStudentContext(adminCtx.browser())

    try {
      await page.goto('/app/internal-exam')
      await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()

      // Available row should appear for the freshly issued code.
      const availableList = page.getByTestId('available-list')
      await expect(availableList).toBeVisible({ timeout: 10_000 })
      const startBtn = page.getByTestId('start-button').first()
      await expect(startBtn).toBeVisible()
      await startBtn.click()

      // Code-entry modal opens.
      const form = page.getByTestId('code-entry-form')
      await expect(form).toBeVisible()
      await page.getByTestId('code-input').fill(code)
      await page.getByRole('button', { name: 'Start exam' }).click()

      // ── 3. Land on session page, answer first option, finish, submit ──────
      await page.waitForURL(/\/app\/quiz\/session/, { timeout: 15_000 })
      await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })

      // Answer one option and confirm it. In exam mode, selection alone leaves
      // answeredCount=0, which keeps the Submit button in the finish dialog
      // disabled — see finish-quiz-dialog.tsx (`answeredCount === 0 && !timeExpired`).
      const answerBtns = page.locator('button[data-testid^="option-"]')
      await answerBtns.first().click()
      await page.getByRole('button', { name: 'Confirm Answer' }).click()
      await page.waitForTimeout(300)

      // Open the finish dialog and submit.
      await page.getByRole('button', { name: 'Finish Internal Exam' }).click()
      await page.getByRole('button', { name: 'Submit Internal Exam' }).click()
      // Only 1 of 10 confirmed → finish-quiz-dialog shows the unanswered-confirm
      // warning. The actual submit fires when "Submit anyway" is clicked.
      await page.getByRole('button', { name: 'Submit anyway' }).click()

      // ── 4. Land on /app/internal-exam/report with badge + pass/fail ───────
      await page.waitForURL(/\/app\/internal-exam\/report\?session=/, { timeout: 30_000 })
      await expect(page.getByText('Internal Exam Complete')).toBeVisible({ timeout: 10_000 })
      // Pass or fail status — both valid outcomes; assert one of them is rendered.
      const badge = page.getByText(/^(Passed|Failed)$/)
      await expect(badge).toBeVisible({ timeout: 10_000 })
      const sessionId = new URL(page.url()).searchParams.get('session')
      if (!sessionId) throw new Error('report URL had no session id')

      // ── 5. Navigate to My Reports tab on /app/internal-exam ────────────────
      await page.goto('/app/internal-exam')
      await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
      await page.getByTestId('tab-reports').click()
      await expect(page.getByTestId('tabpanel-reports')).toBeVisible()
      await expect(page.getByTestId(`report-row-${sessionId}`)).toBeVisible({ timeout: 10_000 })

      // ── 6. Admin opens the attempt report and reloads it ─
      await assertAdminAttemptReport(adminPage, sessionId)
    } finally {
      await studentCtx.tracing
        .stop({ path: test.info().outputPath('student-trace.zip') })
        .catch(() => {})
      await studentCtx.close()
    }
  })

  test('admin report refuses an unknown or missing session id', async ({ page }) => {
    // Both land on the Attempts tab (not on a report).
    await page.goto(`/app/admin/internal-exams/report?session=${UNKNOWN_SESSION_ID}`)
    await expectAttemptsTab(page)
    await expect(page.getByRole('heading', { name: 'Question Breakdown' })).toHaveCount(0)
    await page.goto('/app/admin/internal-exams/report')
    await expectAttemptsTab(page)
  })

  test('a scheduled sitting shows its date and mode, with Start disabled and the reason', async ({
    browser,
  }) => {
    const { sittingId } = await seedSittingFor({
      studentEmail: INTERNAL_EXAM_STUDENT_EMAIL,
      subjectFragment: SUBJECT_LABEL_FRAGMENT,
      status: 'scheduled',
    })
    const { context, page } = await openStudentContext(browser)
    try {
      await page.goto('/app/internal-exam')
      const row = () => page.getByTestId('available-list').getByRole('listitem').first()
      await expect(row()).toContainText(/UTC.*Remote/)
      await expect(row().getByText('Opens when your invigilator starts the sitting.')).toBeVisible()
      await expect(row().getByTestId('start-button')).toBeDisabled()

      // Reload mid-flow: still gated while scheduled.
      await page.reload()
      await expect(page).toHaveURL(/\/app\/internal-exam$/)
      await expect(row().getByTestId('start-button')).toBeDisabled()

      // Invigilator opens the sitting; the student's reload enables Start.
      const admin = getAdminClient()
      const sitting = await admin
        .from('exam_sittings')
        .select('invigilator_id')
        .eq('id', sittingId)
        .single()
      if (sitting.error) throw new Error(`read sitting: ${sitting.error.message}`)
      const invigilatorId = sitting.data.invigilator_id
      const { data, error } = await admin
        .from('exam_sittings')
        .update({ started_at: new Date().toISOString(), started_by: invigilatorId })
        .eq('id', sittingId)
        .is('started_at', null)
        .select('id')
      if (error) throw new Error(`open sitting: ${error.message}`)
      if (data?.length !== 1) throw new Error('open sitting: expected exactly one row')
      await page.reload()
      await expect(row().getByText('Works while the sitting is open.')).toBeVisible()
      await expect(row().getByTestId('start-button')).toBeEnabled()
    } finally {
      await context.close()
    }
  })

  test('a legacy code (no sitting) is still redeemable until it is dropped', async ({
    browser,
  }) => {
    const legacyCode = await insertLegacyCodeFor({
      studentEmail: INTERNAL_EXAM_STUDENT_EMAIL,
      subjectFragment: SUBJECT_LABEL_FRAGMENT,
    })
    const { context, page } = await openStudentContext(browser)
    try {
      await page.goto('/app/internal-exam')
      const start = page.getByTestId('start-button').first()
      await expect(start).toBeEnabled()
      await expect(page.getByText(/^Expires /).first()).toBeVisible()
      await start.click()
      await page.getByTestId('code-input').fill(legacyCode)
      await page.getByRole('button', { name: 'Start exam' }).click()
      await page.waitForURL(/\/app\/quiz\/session/, { timeout: 15_000 })
      await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
    } finally {
      await context.close()
    }
  })
})
