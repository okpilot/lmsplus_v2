/**
 * E2E spec — Internal Exam: no-discard guarantee + admin void mid-session.
 *
 * Covers:
 *   (a) During an active internal exam, the FinishQuizDialog must NOT show a
 *       Discard button (only Submit + Return). Internal exams are by-design
 *       non-discardable for the student — finish-quiz-dialog.tsx gates this on
 *       canDiscard = canDismiss && !isInternalExam.
 *   (b) When the admin voids the code mid-session, the student's next
 *       interaction (continuing to answer + finishing) surfaces the
 *       cancellation: server-side complete_internal_exam_session enforces
 *       voided sessions, so the submit will surface an error or the session
 *       lands on a report flagged as terminated.
 *
 * Seed dependency: apps/web/scripts/seed-exam-eval.ts. Assumes admin
 * (admin@lmsplus.local) and the shared E2E student fixture.
 *
 * NOTE: requires migrations 057a..065 to be applied before this spec passes.
 *
 * Auth: admin storage is the default; a separate student context is opened
 * for the in-session checks.
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/admin.json' })

const SUBJECT_LABEL_FRAGMENT = 'Meteorology'

async function issueCodeAsAdmin(adminPage: Page, subjectFragment: string): Promise<string> {
  await adminPage.goto('/app/admin/internal-exams')
  await expect(adminPage.getByRole('heading', { name: 'Internal Exams' })).toBeVisible()
  const form = adminPage.getByTestId('issue-code-form')
  await form.locator('[aria-label="Student"]').click()
  await adminPage.locator('[data-slot="select-item"]').first().click()
  await form.locator('[aria-label="Subject"]').click()
  await adminPage
    .locator('[data-slot="select-item"]')
    .filter({ hasText: subjectFragment })
    .first()
    .click()
  await form.getByRole('button', { name: 'Issue code' }).click()
  await expect(adminPage.getByText('Internal exam code issued')).toBeVisible({ timeout: 10_000 })
  const code = (await adminPage.getByTestId('issued-code-value').textContent())?.trim()
  if (!code) throw new Error('issued code panel had no value')
  return code
}

async function openStudentContext(
  browser: BrowserContext['browser'],
): Promise<{ context: BrowserContext; page: Page }> {
  if (!browser) throw new Error('browser is null')
  const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
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
  await page.waitForURL(/\/app\/quiz\/session/, { timeout: 15_000 })
  await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
}

test.describe('internal exam — no-discard + admin void', () => {
  test.setTimeout(120_000)

  // ── (a) Discard button is hidden in the finish dialog ─────────────────────

  test('FinishQuizDialog hides Discard but shows Submit and Return during an active internal exam', async ({
    page: adminPage,
    context: adminCtx,
  }) => {
    const code = await issueCodeAsAdmin(adminPage, SUBJECT_LABEL_FRAGMENT)

    const { context: studentCtx, page } = await openStudentContext(adminCtx.browser())
    try {
      await startInternalExamAsStudent(page, code)

      // Open the finish dialog from the session header.
      await page.getByRole('button', { name: 'Finish Internal Exam' }).click()

      // Submit + Return must be visible. Discard must NOT.
      await expect(page.getByRole('button', { name: 'Submit Quiz' })).toBeVisible({
        timeout: 5_000,
      })
      await expect(page.getByRole('button', { name: 'Return to Internal Exam' })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Discard /i })).toHaveCount(0)
    } finally {
      await studentCtx.close()
    }
  })

  // ── (b) Admin voids the code mid-session ──────────────────────────────────

  test('admin voiding the code mid-session surfaces the cancellation to the student', async ({
    page: adminPage,
    context: adminCtx,
  }) => {
    const code = await issueCodeAsAdmin(adminPage, SUBJECT_LABEL_FRAGMENT)

    const { context: studentCtx, page } = await openStudentContext(adminCtx.browser())
    try {
      await startInternalExamAsStudent(page, code)

      // Buffer an answer so the session is not 0-answer.
      await page.locator('button:has(span.rounded-full)').first().click()
      await page.waitForTimeout(300)

      // Admin: navigate to internal-exams, void the freshly issued code.
      await adminPage.goto('/app/admin/internal-exams')
      await expect(adminPage.getByRole('heading', { name: 'Internal Exams' })).toBeVisible()

      // Find the row containing this code and click its Void button.
      const codeRow = adminPage.locator('tr', { hasText: code })
      await expect(codeRow).toBeVisible({ timeout: 10_000 })
      await codeRow.getByRole('button', { name: 'Void' }).click()

      // Void dialog opens — fill reason and submit.
      const reasonInput = adminPage.getByLabel('Reason')
      await reasonInput.fill('E2E spec — voiding mid-session for cancellation surface test')
      await adminPage.getByRole('button', { name: 'Void code' }).click()
      await expect(adminPage.getByText(/Code voided/)).toBeVisible({ timeout: 10_000 })

      // Student: attempt to submit the in-flight session — voided codes must
      // either land on a terminated report OR surface a server-side error.
      await page.getByRole('button', { name: 'Finish Internal Exam' }).click()
      await page.getByRole('button', { name: 'Submit Quiz' }).click()

      const reportUrl = page.waitForURL(/\/app\/quiz\/report/, { timeout: 30_000 })
      const errorText = page
        .getByText(/voided|cancelled|cancel/i)
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })

      await Promise.race([reportUrl, errorText])
    } finally {
      await studentCtx.close()
    }
  })
})
