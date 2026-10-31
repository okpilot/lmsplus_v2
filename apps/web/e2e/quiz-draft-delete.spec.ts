import { expect, test } from '@playwright/test'
import { acceptBeforeUnload } from './helpers/before-unload'
import {
  cleanupMarkedDrafts,
  countMarkedDrafts,
  E2E_DRAFT_MARKER,
  seedMarkedDraft,
} from './helpers/quiz-draft'
import { TEST_EMAIL } from './helpers/supabase'

const DRAFT_LABEL = 'delete-me'
const DRAFT_TEXT = `${E2E_DRAFT_MARKER} ${DRAFT_LABEL}`

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
    await seedMarkedDraft(TEST_EMAIL, DRAFT_LABEL)
    expect(await countMarkedDrafts(TEST_EMAIL)).toBe(1)

    await page.goto('/app/quiz')
    await page.getByTestId('tab-saved').click()
    await expect(page.getByText(DRAFT_TEXT)).toBeVisible()

    await page.reload()
    await page.getByTestId('tab-saved').click()
    await expect(page.getByText(DRAFT_TEXT)).toBeVisible()

    page.once('dialog', (d) => d.accept())
    await page
      .getByTestId('draft-card')
      .filter({ hasText: DRAFT_TEXT })
      .getByTestId('delete-draft')
      .click()
    await expect(page.getByText(DRAFT_TEXT)).toHaveCount(0, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/app\/quiz$/)

    await page.reload()
    await page.getByTestId('tab-saved').click()
    await expect(page.getByText(DRAFT_TEXT)).toHaveCount(0)
    expect(await countMarkedDrafts(TEST_EMAIL)).toBe(0)
  })
})
