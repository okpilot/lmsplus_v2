/**
 * E2E — quiz setup counts refresh on return (#1605): a tab return and a Back navigation re-read
 * the counts; the selected filter survives the refresh.
 *
 * Auth: the shared student (user.json). Hermetic via resetStudentQuizSessions.
 */

import { expect, type Page, test } from '@playwright/test'
import { startStudyQuiz, submitFirstOption } from './helpers/quiz-session'
import { resetStudentQuizSessions } from './helpers/quiz-session-id'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 900 } })

async function openStudySetupWithUnseen(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await page.getByRole('button', { name: 'Study', exact: true }).click()
  await page.locator('[data-testid="subject-trigger"]').click()
  await page.locator('[data-testid="subject-option"]').first().click()
  await page
    .getByText(/^Unseen/)
    .first()
    .click()
}

async function selectedCount(page: Page): Promise<number> {
  const text = await page.getByText(/of \d+ selected/).textContent()
  return Number(text?.match(/of (\d+) selected/)?.[1] ?? Number.NaN)
}

test.describe('Quiz setup counts refresh', () => {
  test.setTimeout(90_000)

  test.beforeEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test.afterEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test('count changes after answering in another tab and returning, filters kept', async ({
    page,
    context,
  }) => {
    await openStudySetupWithUnseen(page)
    const before = await selectedCount(page)

    const other = await context.newPage()
    await startStudyQuiz(other, 3)
    await submitFirstOption(other)
    await page.bringToFront()
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

    await expect.poll(() => selectedCount(page), { timeout: 15_000 }).toBeLessThan(before)
    await expect(page.getByText(/^Unseen/).first()).toBeVisible()
  })

  test('count reflects a finished quiz after Back', async ({ page }) => {
    await openStudySetupWithUnseen(page)
    const before = await selectedCount(page)

    await page.getByRole('button', { name: 'Start Quiz' }).click()
    await page.waitForURL(/\/app\/quiz\/session/, { timeout: 15_000 })
    await submitFirstOption(page)
    await page.getByRole('button', { name: 'Finish Test' }).click()
    await page.getByRole('button', { name: 'Submit Quiz' }).click()
    await page.waitForURL('**/app/quiz/report**', { timeout: 15_000 })

    await page.goBack()
    await page.goBack()
    await expect(page).toHaveURL(/\/app\/quiz$/)

    await page
      .getByText(/^Unseen/)
      .first()
      .waitFor()
    await expect.poll(() => selectedCount(page), { timeout: 15_000 }).toBeLessThan(before)
  })
})
