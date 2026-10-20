/**
 * E2E — Discovery starts in one RPC (#1548): a start while another session is open is refused
 * with a message and no navigation; a reload mid-flow returns to setup (Discovery is non-resumable) and a new start succeeds.
 *
 * Auth: the shared student (user.json). Hermetic via resetStudentQuizSessions (soft-delete).
 */

import { expect, type Page, test } from '@playwright/test'
import { startStudyQuiz } from './helpers/quiz-session'
import { resetStudentQuizSessions } from './helpers/quiz-session-id'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 900 } })

async function clickStartDiscovery(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await expect(page.getByRole('button', { name: 'Discovery', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.locator('[data-testid="subject-trigger"]').click()
  await page.locator('[data-testid="subject-option"]').first().click()
  await page.getByRole('button', { name: 'Start discovery' }).click()
}

test.describe('Discovery start', () => {
  test.setTimeout(60_000)

  test.beforeEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test.afterEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test('refuses to start while another session is open and stays on the picker', async ({
    page,
  }) => {
    await startStudyQuiz(page)
    await clickStartDiscovery(page)

    await expect(page.getByText('Finish or exit your active session first.')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page).toHaveURL(/\/app\/quiz$/)
  })

  test('returns to quiz setup after a reload and starts discovery again', async ({ page }) => {
    await clickStartDiscovery(page)
    await page.waitForURL(/\/app\/quiz\/session$/, { timeout: 15_000 })
    await expect(page.getByText(/Question 1 of/)).toBeVisible({ timeout: 10_000 })

    await page.reload()

    await expect(page).toHaveURL(/\/app\/quiz$/, { timeout: 15_000 })
    await clickStartDiscovery(page)
    await page.waitForURL(/\/app\/quiz\/session$/, { timeout: 15_000 })
    await expect(page.getByText(/Question 1 of/)).toBeVisible({ timeout: 10_000 })
  })
})
