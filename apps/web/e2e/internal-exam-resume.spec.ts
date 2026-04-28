/**
 * E2E spec — Internal Exam mid-session resume.
 *
 * Covers: a student starts an internal exam, reloads the browser tab mid-flow,
 * and is restored to /app/quiz/session via the sessionStorage handoff. If the
 * handoff was lost, the recovery banner on /app/internal-exam is the fallback.
 *
 * Seed dependency: apps/web/scripts/seed-exam-eval.ts. Assumes admin
 * (admin@lmsplus.local) and student (e2e-test@lmsplus.local) fixture users
 * exist in the Egmont Aviation org with at least one active exam_config.
 *
 * NOTE: requires migrations 057a..065 to be applied before this spec passes.
 *
 * Auth: this spec uses the admin storage state to issue a code, then opens a
 * separate student context for the resume verification.
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

test.describe('internal exam — refresh resume', () => {
  test.setTimeout(120_000)

  test('reloading mid-session restores the session page (or surfaces the recovery banner)', async ({
    page: adminPage,
    context: adminCtx,
  }) => {
    const code = await issueCodeAsAdmin(adminPage, SUBJECT_LABEL_FRAGMENT)

    const { context: studentCtx, page } = await openStudentContext(adminCtx.browser())
    try {
      await startInternalExamAsStudent(page, code)

      // Buffer one answer so there's state worth recovering.
      await page.locator('button:has(span.rounded-full)').first().click()
      await page.waitForTimeout(300)

      // Force a full reload — sessionStorage survives in-tab reloads, so the
      // session page should rehydrate via the handoff. If the handoff is lost
      // (e.g. fresh tab), the /app/internal-exam page exposes a recovery banner.
      await page.reload()

      const questionText = page.getByText(/Question \d/)
      const recoveryBanner = page.getByTestId('internal-exam-recovery-banner')
      await expect(questionText.or(recoveryBanner)).toBeVisible({ timeout: 15_000 })

      if (await recoveryBanner.isVisible().catch(() => false)) {
        // Banner path — clicking Resume must land back on /app/quiz/session.
        await page.getByTestId('resume-internal-exam-link').click()
        await page.waitForURL(/\/app\/quiz\/session/, { timeout: 10_000 })
        await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
      }
      // Otherwise: warm rehydrate path — the question is already visible.
    } finally {
      await studentCtx.close()
    }
  })

  test('navigating to /app/internal-exam mid-session shows the recovery banner', async ({
    page: adminPage,
    context: adminCtx,
  }) => {
    const code = await issueCodeAsAdmin(adminPage, SUBJECT_LABEL_FRAGMENT)

    const { context: studentCtx, page } = await openStudentContext(adminCtx.browser())
    try {
      await startInternalExamAsStudent(page, code)

      // Clear the warm sessionStorage handoff so only the server-side active
      // session remains. The /app/internal-exam page must surface a banner.
      await page.evaluate(() => {
        for (const key of Object.keys(sessionStorage)) {
          if (key.startsWith('quiz-session:')) sessionStorage.removeItem(key)
        }
      })

      await page.goto('/app/internal-exam')
      await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
      await expect(page.getByTestId('internal-exam-recovery-banner')).toBeVisible({
        timeout: 10_000,
      })

      // Resume button navigates back to the session page.
      await page.getByTestId('resume-internal-exam-link').click()
      await page.waitForURL(/\/app\/quiz\/session/, { timeout: 10_000 })
      await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
    } finally {
      await studentCtx.close()
    }
  })
})
