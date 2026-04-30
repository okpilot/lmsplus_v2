import { expect, test } from '@playwright/test'
import { E2E_ADMIN_Q_MARKER, restoreSeededQuestionsState } from './helpers/supabase'

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

  test('filters by difficulty', async ({ page }) => {
    // Click the difficulty filter trigger
    const difficultyTrigger = page.locator('[aria-label="Difficulty"]')
    await difficultyTrigger.click()
    await page.locator('[data-slot="select-item"]').filter({ hasText: 'Easy' }).click()

    // URL should contain difficulty=easy
    await expect(page).toHaveURL(/difficulty=easy/)
  })

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
    // Marker prefix lets the afterEach helper soft-delete this row so it
    // doesn't leak into downstream specs.
    const uniqueText = `${E2E_ADMIN_Q_MARKER} ${Date.now()}: What is the tropopause?`

    // Open create dialog
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
    await page.getByPlaceholder('Enter the question...').fill(uniqueText)

    // Fill options
    await page
      .getByPlaceholder('Option A')
      .fill('The boundary between troposphere and stratosphere')
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

  // TODO: flaky — AlertDialog interaction timing issue with Base UI in Playwright
  test.skip('soft-deletes a question with confirmation', async ({ page }) => {
    // Click delete button on first row (title="Delete question")
    const deleteBtn = page.locator('button[title="Delete question"]').first()
    await deleteBtn.waitFor({ state: 'visible' })
    await deleteBtn.click()

    // Confirmation dialog should appear
    const confirmText = page.getByText('Delete question?')
    await expect(confirmText).toBeVisible({ timeout: 5_000 })

    // Confirm delete — click the destructive action button
    await page.locator('button:has-text("Delete"):not([title])').click()

    // Toast should confirm deletion
    await expect(page.locator('text=/Deleted/').first()).toBeVisible({ timeout: 10_000 })
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
