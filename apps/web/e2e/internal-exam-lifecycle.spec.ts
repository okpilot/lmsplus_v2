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
 * Auth: uses both `e2e/.auth/admin.json` and `e2e/.auth/user.json`. The
 * default `test.use({ storageState })` pins the page to admin; we open a
 * second context with the student state for the second half of the flow.
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'

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

  // Pick the first available student.
  const studentSelect = form.locator('[aria-label="Student"]')
  await studentSelect.click()
  await adminPage.locator('[data-slot="select-item"]').first().click()

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
  const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
  const page = await context.newPage()
  return { context, page }
}

test.describe('internal exam — lifecycle', () => {
  test.setTimeout(120_000)

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

      // Answer one option (exam mode buffers selection client-side).
      const answerBtns = page.locator('button:has(span.rounded-full)')
      await answerBtns.first().click()
      await page.waitForTimeout(300)

      // Open the finish dialog and submit.
      await page.getByRole('button', { name: 'Finish Internal Exam' }).click()
      await page.getByRole('button', { name: 'Submit Quiz' }).click()

      // ── 4. Land on /app/quiz/report with badge + pass/fail ────────────────
      await page.waitForURL(/\/app\/quiz\/report\?session=/, { timeout: 30_000 })
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
      await studentCtx.close()
    }
  })
})
