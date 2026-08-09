import { expect, type Page, test } from '@playwright/test'
import { E2E_ADMIN_Q_MARKER, restoreSeededQuestionsState } from './helpers/supabase'

/**
 * Question text carrying the E2E marker prefix, so the `afterEach` helper can
 * soft-delete the row and it never leaks into downstream specs (#587).
 */
function markedQuestionText(): string {
  return `${E2E_ADMIN_Q_MARKER} ${Date.now()}: What is the tropopause?`
}

/**
 * Drive the New Question dialog to completion. Shared by the create test (which
 * asserts the creation itself) and the delete test (which needs a row it owns,
 * rather than soft-deleting a seeded question the rest of the admin-e2e project
 * still depends on).
 */
async function createQuestionViaDialog(page: Page, questionText: string): Promise<void> {
  await page.getByRole('button', { name: 'New Question' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })

  // Select subject in the cascader
  const dialog = page.getByRole('dialog')
  const dialogTriggers = dialog.locator('[data-slot="select-trigger"]')
  await dialogTriggers.first().click()
  await page.locator('[data-slot="select-item"]').filter({ hasText: 'Meteorology' }).click()

  // Wait for topic select to become enabled
  await expect(dialogTriggers.nth(1)).not.toBeDisabled({ timeout: 5_000 })

  // Select topic
  await dialogTriggers.nth(1).click()
  await page.locator('[data-slot="select-item"]').filter({ hasText: 'The atmosphere' }).click()

  // Fill question text
  await page.getByPlaceholder('Enter the question...').fill(questionText)

  // Fill options
  await page.getByPlaceholder('Option A').fill('The boundary between troposphere and stratosphere')
  await page.getByPlaceholder('Option B').fill('The top of the mesosphere')
  await page.getByPlaceholder('Option C').fill('The base of the ionosphere')
  await page.getByPlaceholder('Option D').fill('The ozone layer boundary')

  // Mark option A as correct
  await page.getByLabel('Mark option A as correct').click()

  // Fill explanation
  await page
    .getByPlaceholder('Explain the correct answer...')
    .fill('The tropopause is the boundary between the troposphere and stratosphere.')

  // Submit
  await page.getByRole('button', { name: 'Create Question' }).click()
}

// Use admin auth state from admin-auth.setup.ts
test.use({ storageState: 'e2e/.auth/admin.json' })

test.describe('Admin Question Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/admin/questions')
    await expect(page.getByRole('heading', { name: 'Question Editor' })).toBeVisible()
  })

  // Restore seed state after every test in this file. Two tests in here
  // (Section 3 create, Section 5 bulk-Deactivate) mutate shared rows that
  // internal-exam specs depend on — without restore the rest of the
  // admin-e2e project fails with `insufficient_questions_for_exam` (#587).
  test.afterEach(async () => {
    await restoreSeededQuestionsState()
  })

  // ── Section 1: Page loads correctly ──────────────────────────────────

  test('displays seeded questions in the table', async ({ page }) => {
    // Seed data has questions — count varies by environment (local: EVAL-*, CI: CI-*).
    // Anchor the regex so we don't double-match the pagination footer
    // ("Showing 1–25 of N questions").
    await expect(page.getByText(/^\d+ questions?$/)).toBeVisible()
    // At least one question row should be visible in the table
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('shows subject code in table columns', async ({ page }) => {
    // Subject column should show "050" (Meteorology code)
    await expect(page.getByText('050').first()).toBeVisible()
  })

  // ── Section 2: Filters ──────────────────────────────────────────────

  test('filters by status', async ({ page }) => {
    const statusTrigger = page.locator('[aria-label="Status"]')
    await statusTrigger.click()
    await page.locator('[data-slot="select-item"]').filter({ hasText: 'Active' }).click()

    await expect(page).toHaveURL(/status=active/)
  })

  test('search filters by question text and clears on empty', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search question text...')

    // Search for a specific question
    await searchInput.fill('QNH')
    await searchInput.press('Enter')
    await expect(page).toHaveURL(/search=QNH/)

    // Clear search
    await searchInput.fill('')
    // URL should no longer have search param
    await expect(page).not.toHaveURL(/search=/)
  })

  // ── Section 3: Create question ──────────────────────────────────────

  test('creates a new question via the dialog', async ({ page }) => {
    const uniqueText = markedQuestionText()

    await createQuestionViaDialog(page, uniqueText)

    // Wait for success toast and table refresh
    await expect(page.getByText('Question created')).toBeVisible({ timeout: 10_000 })
  })

  // ── Section 4: Edit question ────────────────────────────────────────

  test('edits an existing question', async ({ page }) => {
    // Click the edit button on the first row
    await page.getByLabel('Edit question').first().click()

    // Dialog should show "Edit Question"
    await expect(page.getByText('Edit Question')).toBeVisible()
    await expect(page.getByText('Update the question details')).toBeVisible()

    // Change the difficulty
    const difficultySelect = page.locator('[role="dialog"] [aria-label="Difficulty"]')
    await difficultySelect.click()
    await page.locator('[data-slot="select-item"]').filter({ hasText: 'Hard' }).click()

    // Save
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByText('Question updated')).toBeVisible({ timeout: 10_000 })
  })

  // ── Section 5: Row selection and bulk actions ───────────────────────

  test('selects rows and performs bulk status change', async ({ page }) => {
    // Select all questions via header checkbox
    const headerCheckbox = page.getByLabel('Select all questions')
    await headerCheckbox.click()

    // Bulk actions bar should appear
    await expect(page.getByText(/\d+ selected/)).toBeVisible()

    // Click Deactivate
    await page.getByRole('button', { name: 'Deactivate' }).click()

    // Toast should confirm
    await expect(page.getByText(/set to draft/)).toBeVisible({ timeout: 10_000 })
  })

  // ── Section 6: Delete question ──────────────────────────────────────

  // Re-enabled in #367. Two changes made it stable:
  //   1. It deletes a question it CREATED (marker-prefixed), not the first
  //      seeded row. Soft-deleting a seeded question permanently shrinks the
  //      org's pool — `restoreSeededQuestionsState` has no un-delete step — and
  //      admin-questions runs before internal-exam-*, which then fail with
  //      `insufficient_questions_for_exam` (the #587 failure mode).
  //   2. Role-based, dialog-scoped locators replace the old
  //      `button:has-text("Delete"):not([title])` CSS selector, which also
  //      matched the row trigger and raced the Base UI open animation — the
  //      original source of the flake this test was skipped for.
  test('soft-deletes a question with confirmation', async ({ page }) => {
    const uniqueText = markedQuestionText()

    // Own the row under test.
    await createQuestionViaDialog(page, uniqueText)
    await expect(page.getByText('Question created')).toBeVisible({ timeout: 10_000 })

    // Isolate it: the table is paginated, so search rather than assume page 1.
    await page.getByPlaceholder('Search question text...').fill(uniqueText)
    await page.getByPlaceholder('Search question text...').press('Enter')

    const row = page.locator('tbody tr').filter({ hasText: uniqueText })
    await expect(row).toBeVisible({ timeout: 10_000 })

    await row.getByRole('button', { name: 'Delete question' }).click()

    // Confirmation dialog — scope the action to the dialog so the row's own
    // trigger can never be the click target. Base UI renders AlertDialog with
    // role="alertdialog" (not "dialog"), and Playwright's role engine matches on
    // strict equality, so `getByRole('dialog')` here would never resolve — same
    // form as quiz-session-recovery.spec.ts / exam-recovery.spec.ts.
    const confirmDialog = page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
    await expect(confirmDialog.getByText('Delete question?')).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click()

    // Success toast names the deleted question.
    await expect(page.getByText(/^Deleted /)).toBeVisible({ timeout: 10_000 })

    // The row is gone after a reload — proves the delete persisted, not just
    // that a toast fired. This is the assertion that fails when the RLS
    // regression behind #815 comes back.
    await page.reload()
    await page.getByPlaceholder('Search question text...').fill(uniqueText)
    await page.getByPlaceholder('Search question text...').press('Enter')
    await expect(page.locator('tbody tr').filter({ hasText: uniqueText })).toHaveCount(0, {
      timeout: 10_000,
    })
  })

  // ── Section 7: Empty state ──────────────────────────────────────────

  test('shows empty state when no questions match filters', async ({ page }) => {
    // Search for something that won't match
    const searchInput = page.getByPlaceholder('Search question text...')
    await searchInput.fill('xyznonexistent12345')
    await searchInput.press('Enter')

    // Should show empty state
    await expect(page.getByText('No questions found')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('0 questions')).toBeVisible()
  })
})
