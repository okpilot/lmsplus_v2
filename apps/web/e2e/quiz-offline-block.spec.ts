import { expect, test } from '@playwright/test'
import { acceptBeforeUnload } from './helpers/before-unload'
import {
  clearQuizActiveSessionKeys,
  readServerAnsweredCount,
  startStudyQuiz,
} from './helpers/quiz-session'
import { cleanupStudentActiveSessions, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

// The runner arms a native leave prompt; an unhandled one cancels reload() and goto().
test.beforeEach(({ page }) => {
  acceptBeforeUnload(page)
})

test.describe('Quiz blocks while an answer is unsent and resends on reconnect', () => {
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test.afterEach(async ({ page, context }) => {
    await context.setOffline(false)
    await clearQuizActiveSessionKeys(page)
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test('an answer submitted offline blocks the quiz, then is sent and saved once the connection returns', async ({
    page,
    context,
  }) => {
    const total = await startStudyQuiz(page)
    const options = page.locator('button:has(span.rounded-full)')
    await options.first().waitFor({ state: 'visible' })
    expect(await readServerAnsweredCount()).toBe(0)

    // Entry: connection drops, the student submits an answer.
    await context.setOffline(true)
    await options.first().click()
    await page.getByRole('button', { name: 'Submit Answer' }).first().click()

    // In progress: a non-dismissable overlay blocks the quiz and nothing reached the server.
    const overlay = page.getByRole('alertdialog')
    await expect(overlay).toBeVisible({ timeout: 10_000 })
    await expect(overlay.getByText('Connection lost — reconnecting…')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(overlay).toBeVisible()
    expect(await readServerAnsweredCount()).toBe(0)

    // Exit: the connection returns, the overlay clears and the answer lands server-side.
    await context.setOffline(false)
    await expect(overlay).toBeHidden({ timeout: 20_000 })
    await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Submit Answer' })).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)

    // Post-exit + reload mid-flow: the same session URL reopens the quiz with the saved answer.
    const sessionUrl = page.url()
    await page.reload()
    await expect(page).toHaveURL(sessionUrl)
    await expect(page.getByText(`Question 1 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'Resume your quiz?' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Submit Answer' })).toHaveCount(0, {
      timeout: 10_000,
    })
    expect(await readServerAnsweredCount()).toBe(1)
  })
})
