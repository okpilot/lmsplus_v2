/**
 * E2E — quiz setup counts refresh on return (#1605): a tab return and a Back navigation re-read
 * the counts; the selected filter survives the refresh.
 *
 * Auth: the shared student (user.json). Hermetic via resetStudentQuizSessions.
 */

import { expect, type Page, test } from '@playwright/test'
import { submitFirstOption } from './helpers/quiz-session'
import { resetStudentQuizSessions, SESSION_ID_URL } from './helpers/quiz-session-id'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 900 } })

// Discovery (the default mode) reads the server preload; Unseen is a preloaded filter set.
async function openDiscoveryWithUnseen(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await page.locator('[data-testid="subject-trigger"]').click()
  await page.locator('[data-testid="subject-option"]').first().click()
  await page.getByRole('switch', { name: 'Unseen' }).click()
}

/** Study quiz over unseen questions only: the answered question is certain to leave the unseen count. */
async function startUnseenStudyQuiz(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Study', exact: true }).click()
  await page.locator('[data-testid="subject-trigger"]').click()
  await page.locator('[data-testid="subject-option"]').first().click()
  await page.getByRole('switch', { name: 'Unanswered' }).click()
  await page.getByRole('button', { name: 'All' }).click()
  await page.getByRole('button', { name: 'Start Quiz' }).click()
  await page.waitForURL(SESSION_ID_URL, { timeout: 10_000 })
}

/** Answers one question of an unseen-only Study quiz and submits it (answers are written on submit). */
async function finishOneAnswerQuiz(page: Page): Promise<void> {
  await startUnseenStudyQuiz(page)
  await submitFirstOption(page)
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await expect(page.getByRole('dialog', { name: 'Finish Quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Submit Quiz' }).click()
  // 9 questions stay unanswered: confirm the partial submit.
  await page.getByRole('button', { name: 'Submit anyway' }).click()
  await page.waitForURL('**/app/quiz/report**', { timeout: 15_000 })
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
    await openDiscoveryWithUnseen(page)
    const before = await selectedCount(page)

    const other = await context.newPage()
    await finishOneAnswerQuiz(other)
    await page.bringToFront()
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

    await expect.poll(() => selectedCount(page), { timeout: 15_000 }).toBeLessThan(before)
    await expect(page.getByRole('switch', { name: 'Unseen' })).toBeChecked()
  })

  test('count reflects a finished quiz after Back', async ({ page }) => {
    await openDiscoveryWithUnseen(page)
    const before = await selectedCount(page)

    await finishOneAnswerQuiz(page)

    // The report replaces the session entry: one Back lands on the setup page.
    await page.goBack()
    await expect(page).toHaveURL(/\/app\/quiz$/)

    // The restored page remounts: pick the same subject and filter on the restored payload.
    await page.locator('[data-testid="subject-trigger"]').click()
    await page.locator('[data-testid="subject-option"]').first().click()
    await page.getByRole('switch', { name: 'Unseen' }).click()
    await expect.poll(() => selectedCount(page), { timeout: 15_000 }).toBeLessThan(before)
  })
})
