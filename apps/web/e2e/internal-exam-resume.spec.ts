/**
 * E2E spec — Internal Exam mid-session resume.
 *
 * Covers: a student starts an internal exam, reloads the browser tab mid-flow,
 * and the same /app/quiz/session/<id> URL reopens the exam with its answers from
 * the server. With nothing left in the browser, the recovery banner on
 * /app/internal-exam links to that URL.
 *
 * Seed dependency: apps/web/scripts/seed-exam-eval.ts. Assumes admin
 * (admin@lmsplus.local) and the dedicated internal-exam student fixture
 * (e2e-internal-exam@lmsplus.local) exist in the Egmont Aviation org with at
 * least one active exam_config.
 *
 * NOTE: requires migrations 057a..065 to be applied before this spec passes.
 *
 * Auth: this spec uses the admin storage state to issue a code, then opens a
 * separate student context (internal-exam-student.json) for the resume check.
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { signInAsAdmin } from './helpers/admin-supabase'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { isServerActionPost } from './helpers/quiz-session'
import { SESSION_ID_URL } from './helpers/quiz-session-id'
import { issueSittingCodeFor } from './helpers/sitting-code'
import {
  cleanupInternalExamStudentActiveSessions,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/admin.json' })

const SUBJECT_LABEL_FRAGMENT = 'Meteorology'

/** Service-role seed: an open sitting holding the student with a live code (no UI, no RPC). */
async function issueCode(): Promise<string> {
  const { code } = await issueSittingCodeFor({
    studentEmail: INTERNAL_EXAM_STUDENT_EMAIL,
    subjectFragment: SUBJECT_LABEL_FRAGMENT,
  })
  return code
}

async function openStudentContext(
  browser: BrowserContext['browser'],
): Promise<{ context: BrowserContext; page: Page }> {
  if (!browser) throw new Error('browser is null')
  const context = await browser.newContext({
    storageState: 'e2e/.auth/internal-exam-student.json',
  })
  // Manual contexts don't inherit global trace — start it explicitly. See #587.
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true }).catch(() => {})
  const page = await context.newPage()
  return { context, page }
}

async function startInternalExamAsStudent(page: Page, code: string): Promise<void> {
  await page.goto('/app/internal-exam')
  await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
  await page.getByTestId('start-button').first().click()
  await expect(page.getByTestId('code-entry-form')).toBeVisible()
  await page.getByTestId('code-input').fill(code)
  await page.getByRole('button', { name: 'Start exam' }).click()
  await page.waitForURL(SESSION_ID_URL, { timeout: 15_000 })
  await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
}

test.describe('internal exam — refresh resume', () => {
  test.setTimeout(120_000)

  // Stale-session cleanup — see issue #587.
  test.beforeEach(async () => {
    const adminClient = await signInAsAdmin()
    await cleanupInternalExamStudentActiveSessions(adminClient)
    await cleanupE2eExamSittings()
  })

  test.afterEach(async () => {
    await cleanupE2eExamSittings()
  })

  test('reloading mid-session reopens the same exam URL with the confirmed answer locked', async ({
    context: adminCtx,
  }) => {
    const code = await issueCode()

    const { context: studentCtx, page } = await openStudentContext(adminCtx.browser())
    try {
      await startInternalExamAsStudent(page, code)
      const sessionUrl = page.url()

      // Confirming is what records the answer on the server; selection alone does not.
      const firstOption = page.locator('button[data-testid^="option-"]').first()
      await firstOption.click()
      const answerSaved = page.waitForResponse((response) => isServerActionPost(response.request()))
      await page.getByRole('button', { name: 'Confirm Answer' }).click()
      await expect(firstOption).toBeDisabled()
      expect((await answerSaved).ok()).toBe(true)

      await page.reload()

      await expect(page).toHaveURL(sessionUrl)
      await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('heading', { name: /Resume your/i })).toHaveCount(0)
      await expect(page.locator('button[data-testid^="option-"]').first()).toBeDisabled()
    } finally {
      await studentCtx.tracing
        .stop({ path: test.info().outputPath('student-trace.zip') })
        .catch(() => {})
      await studentCtx.close()
    }
  })

  test('navigating to /app/internal-exam mid-session shows the recovery banner', async ({
    context: adminCtx,
  }) => {
    const code = await issueCode()

    const { context: studentCtx, page } = await openStudentContext(adminCtx.browser())
    try {
      await startInternalExamAsStudent(page, code)
      const sessionUrl = page.url()

      // Leave nothing in the browser so only the server-side active session remains.
      // The /app/internal-exam page must surface a banner.
      await page.evaluate(() => {
        localStorage.clear()
        sessionStorage.clear()
      })

      await page.goto('/app/internal-exam')
      await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
      await expect(page.getByTestId('internal-exam-recovery-banner')).toBeVisible({
        timeout: 10_000,
      })

      // The Resume link opens the exam's own session URL.
      await page.getByTestId('resume-internal-exam-link').click()
      await page.waitForURL(SESSION_ID_URL, { timeout: 10_000 })
      expect(page.url()).toBe(sessionUrl)
      await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
    } finally {
      await studentCtx.tracing
        .stop({ path: test.info().outputPath('student-trace.zip') })
        .catch(() => {})
      await studentCtx.close()
    }
  })
})
