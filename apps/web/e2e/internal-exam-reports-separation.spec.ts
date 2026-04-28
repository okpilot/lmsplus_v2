/**
 * E2E spec — Internal Exam reports are separated from Practice Exam reports.
 *
 * Covers: a student with both a `mock_exam` (practice) attempt AND an
 * `internal_exam` attempt sees:
 *   - /app/reports lists ONLY the practice attempt (filter excludes
 *     internal_exam — see lib/queries/reports.ts).
 *   - /app/internal-exam My Reports tab lists ONLY the internal attempt.
 *
 * Seed dependency: apps/web/scripts/seed-exam-eval.ts. Assumes admin
 * (admin@lmsplus.local) and the shared E2E student fixture.
 *
 * NOTE: requires migrations 057a..065 to be applied before this spec passes.
 *
 * Auth: admin storage is the default; a separate student context is opened
 * for the student-side assertions.
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

async function runPracticeExamToCompletion(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

  await page.getByRole('button', { name: 'Practice Exam', exact: true }).click()
  await page.locator('[data-testid="subject-trigger"]').click()
  await page.locator('[data-testid="subject-option"]').filter({ hasText: '050' }).first().click()
  await expect(page.getByText('Practice Exam Parameters')).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: 'Start Practice Exam' }).click()
  await page.waitForURL(/\/app\/quiz\/session/, { timeout: 15_000 })
  await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })

  await page.locator('button:has(span.rounded-full)').first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Finish Practice Exam' }).click()
  await page.getByRole('button', { name: 'Submit Quiz' }).click()
  await page.waitForURL(/\/app\/quiz\/report\?session=/, { timeout: 30_000 })
}

async function runInternalExamToCompletion(page: Page, code: string): Promise<void> {
  await page.goto('/app/internal-exam')
  await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
  await page.getByTestId('start-button').first().click()
  await expect(page.getByTestId('code-entry-form')).toBeVisible()
  await page.getByTestId('code-input').fill(code)
  await page.getByRole('button', { name: 'Start exam' }).click()
  await page.waitForURL(/\/app\/quiz\/session/, { timeout: 15_000 })
  await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })

  await page.locator('button:has(span.rounded-full)').first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Finish Internal Exam' }).click()
  await page.getByRole('button', { name: 'Submit Quiz' }).click()
  await page.waitForURL(/\/app\/quiz\/report\?session=/, { timeout: 30_000 })
}

test.describe('internal exam — reports separation', () => {
  test.setTimeout(180_000)

  test('practice attempt shows only on /app/reports; internal attempt only on /app/internal-exam', async ({
    page: adminPage,
    context: adminCtx,
  }) => {
    const code = await issueCodeAsAdmin(adminPage, SUBJECT_LABEL_FRAGMENT)

    const { context: studentCtx, page } = await openStudentContext(adminCtx.browser())
    try {
      // Run a practice exam first — this creates a mock_exam quiz_sessions row.
      await runPracticeExamToCompletion(page)

      // Run an internal exam — this creates an internal_exam quiz_sessions row.
      await runInternalExamToCompletion(page, code)

      // ── /app/reports lists ONLY mock_exam (practice) attempts ───────────────
      await page.goto('/app/reports')
      await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()

      // Practice Exam label should be present.
      await expect(page.getByText('Practice Exam').first()).toBeVisible({ timeout: 10_000 })
      // Internal Exam label must NOT appear.
      await expect(page.getByText('Internal Exam', { exact: true })).toHaveCount(0)

      // ── /app/internal-exam My Reports tab lists ONLY internal_exam ──────────
      await page.goto('/app/internal-exam')
      await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
      await page.getByTestId('tab-reports').click()
      await expect(page.getByTestId('tabpanel-reports')).toBeVisible()

      // At least one internal-exam report row.
      const reportRows = page.locator('[data-testid^="report-row-"]')
      await expect(reportRows.first()).toBeVisible({ timeout: 10_000 })
      // There must be NO "Practice Exam" copy in the My Reports tab — internal
      // exam history is internal-only.
      await expect(
        page.getByTestId('tabpanel-reports').getByText('Practice Exam', { exact: true }),
      ).toHaveCount(0)
    } finally {
      await studentCtx.close()
    }
  })
})
