/**
 * E2E spec — Internal Exam end-to-end lifecycle.
 *
 * Covers: admin issues a code → student starts → submits → views report →
 * sees the attempt listed in My Reports.
 *
 * Seed dependency: apps/web/scripts/seed-exam-eval.ts. The CI seed
 * (apps/web/scripts/seed-e2e.ts) creates a MET exam_config which
 * `start_internal_exam_session` reuses (same time/total/passmark fields).
 * This spec assumes the existing admin/student fixture (admin@lmsplus.local
 * + student@lmsplus.local) is loaded; it does not seed its own users.
 *
 * NOTE: requires migrations 057a..065 (internal_exam_codes table, RPCs
 *       issue_internal_exam_code / start_internal_exam_session /
 *       complete_internal_exam_session) to be applied. Until then the
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
import {
  cleanupInternalExamStudentActiveSessions,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'

test.describe.configure({ mode: 'serial' })

// Default to admin storage; we open a separate student context inside each test.
test.use({ storageState: 'e2e/.auth/admin.json' })

const SUBJECT_LABEL_FRAGMENT = 'Meteorology'

async function issueCodeAsAdmin(adminPage: Page, subjectFragment: string): Promise<string> {
  await adminPage.goto('/app/admin/internal-exams')
  await expect(adminPage.getByRole('heading', { name: 'Internal Exams' })).toBeVisible()

  // Open the issue-code form.
  const form = adminPage.getByTestId('issue-code-form')
  await expect(form).toBeVisible()

  // Pin selection to the dedicated internal-exam student fixture.
  const studentSelect = form.locator('[aria-label="Student"]')
  await studentSelect.click()
  await adminPage
    .locator('[data-slot="select-item"]')
    .filter({ hasText: INTERNAL_EXAM_STUDENT_EMAIL })
    .first()
    .click()

  // Pick the subject by name fragment.
  const subjectSelect = form.locator('[aria-label="Subject"]')
  await subjectSelect.click()
  await adminPage
    .locator('[data-slot="select-item"]')
    .filter({ hasText: subjectFragment })
    .first()
    .click()

  await form.getByRole('button', { name: 'Issue code' }).click()
  await expect(adminPage.getByText('Internal exam code issued')).toBeVisible({ timeout: 10_000 })

  const issuedCode = adminPage.getByTestId('issued-code-value')
  await expect(issuedCode).toBeVisible()
  const code = (await issuedCode.textContent())?.trim()
  if (!code) throw new Error('issued code panel had no value')
  return code
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
  })

  test('admin issues code, student starts + submits, attempt appears in My Reports', async ({
    page: adminPage,
    context: adminCtx,
  }) => {
    // ── 1. Admin issues a code ──────────────────────────────────────────────
    const code = await issueCodeAsAdmin(adminPage, SUBJECT_LABEL_FRAGMENT)
    expect(code).toMatch(/^[A-HJKLMNPQRSTUVWXYZ23456789]{8}$/)

    // ── 2. Student logs in via separate context (uses user.json storage) ────
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
      const answerBtns = page.locator('button:has(span.rounded-full)')
      await answerBtns.first().click()
      await page.getByRole('button', { name: 'Confirm Answer' }).click()
      await page.waitForTimeout(300)

      // Open the finish dialog and submit.
      await page.getByRole('button', { name: 'Finish Internal Exam' }).click()
      await page.getByRole('button', { name: 'Submit Internal Exam' }).click()
      // Only 1 of 10 confirmed → finish-quiz-dialog shows the unanswered-confirm
      // warning. The actual submit fires when "Submit anyway" is clicked.
      await page.getByRole('button', { name: 'Submit anyway' }).click()

      // ── 4. Land on /app/quiz/report with badge + pass/fail ────────────────
      await page.waitForURL(/\/app\/internal-exam\/report\?session=/, { timeout: 30_000 })
      await expect(page.getByText('Internal Exam Complete')).toBeVisible({ timeout: 10_000 })
      // Pass or fail badge — both valid outcomes; assert one of them is rendered.
      const badge = page.getByText(/^(PASSED|FAILED)$/)
      await expect(badge).toBeVisible({ timeout: 10_000 })

      // ── 5. Navigate to My Reports tab on /app/internal-exam ────────────────
      await page.goto('/app/internal-exam')
      await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
      await page.getByTestId('tab-reports').click()
      await expect(page.getByTestId('tabpanel-reports')).toBeVisible()
      // At least one attempt row should exist.
      await expect(page.locator('[data-testid^="report-row-"]').first()).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await studentCtx.tracing
        .stop({ path: test.info().outputPath('student-trace.zip') })
        .catch(() => {})
      await studentCtx.close()
    }
  })
})
