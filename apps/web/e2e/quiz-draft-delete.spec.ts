import { expect, test } from '@playwright/test'
import { acceptBeforeUnload } from './helpers/before-unload'
import { cleanupMarkedDrafts, countMarkedDrafts, seedMarkedDraft } from './helpers/quiz-draft'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

test.beforeEach(({ page }) => {
  acceptBeforeUnload(page)
})

test.describe('Saved draft delete', () => {
  test.beforeEach(async () => {
    await cleanupMarkedDrafts(TEST_EMAIL)
  })

  test.afterEach(async () => {
    await cleanupMarkedDrafts(TEST_EMAIL)
  })

  test('deleting a draft from its card removes it in place and it stays gone after reload', async ({
    page,
  }) => {
    await seedMarkedDraft(TEST_EMAIL, 'delete-me')
    expect(await countMarkedDrafts(TEST_EMAIL)).toBe(1)

    await page.goto('/app/quiz')
    await page.getByTestId('tab-saved').click()
    await expect(page.getByText('[E2E_DRAFT] delete-me')).toBeVisible()

    await page.reload()
    await page.getByTestId('tab-saved').click()
    await expect(page.getByText('[E2E_DRAFT] delete-me')).toBeVisible()

    page.once('dialog', (d) => d.accept())
    await page.getByTestId('delete-draft').first().click()
    await expect(page.getByText('[E2E_DRAFT] delete-me')).toHaveCount(0, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/app\/quiz$/)

    await page.reload()
    await page.getByTestId('tab-saved').click()
    await expect(page.getByText('[E2E_DRAFT] delete-me')).toHaveCount(0)
    expect(await countMarkedDrafts(TEST_EMAIL)).toBe(0)
  })
})
