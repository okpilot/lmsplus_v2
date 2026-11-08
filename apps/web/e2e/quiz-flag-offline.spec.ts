import { expect, test } from '@playwright/test'
import { softDeleteStudentFlags } from './helpers/flags'
import { clearQuizActiveSessionKeys, startStudyQuiz } from './helpers/quiz-session'
import { cleanupStudentActiveSessions, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

test.describe('Flagging while offline goes through the reconnect queue', () => {
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
    await softDeleteStudentFlags(TEST_EMAIL)
  })

  test.afterEach(async ({ page, context }) => {
    await context.setOffline(false)
    await clearQuizActiveSessionKeys(page)
    await cleanupStudentActiveSessions(TEST_EMAIL)
    await softDeleteStudentFlags(TEST_EMAIL)
  })

  test('a flag pressed offline blocks the quiz, then lands once the connection returns and survives a reload', async ({
    page,
    context,
  }) => {
    await startStudyQuiz(page)
    const flag = page.getByTestId('flag-button')
    await flag.waitFor({ state: 'visible' })

    await context.setOffline(true)
    await flag.click()

    const overlay = page.getByRole('alertdialog')
    await expect(overlay).toBeVisible({ timeout: 10_000 })
    await expect(overlay.getByText('Connection lost — reconnecting…')).toBeVisible()

    await context.setOffline(false)
    await expect(overlay).toBeHidden({ timeout: 20_000 })
    await expect(flag).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })

    await page.reload()
    await expect(page.getByTestId('flag-button')).toHaveAttribute('aria-pressed', 'true', {
      timeout: 10_000,
    })
  })
})
