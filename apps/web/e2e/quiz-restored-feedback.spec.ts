import { expect, type Page, test } from '@playwright/test'
import { clearQuizActiveSessionKeys, startStudyQuiz } from './helpers/quiz-session'
import { SESSION_ID_URL } from './helpers/quiz-session-id'
import { cleanupStudentActiveSessions, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

const GRADED_CLASS = /bg-(green|red)-500/

function gridButton(page: Page, index: number) {
  return page.locator(`[data-testid="grid-btn-${index}"]:visible`).first()
}

test.describe('Quiz restored answer feedback', () => {
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test.afterEach(async ({ page }) => {
    await clearQuizActiveSessionKeys(page)
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test('colours an answered question in the navigator after a reload without visiting it', async ({
    page,
  }) => {
    const total = await startStudyQuiz(page)

    const options = page.locator('button:has(span.rounded-full)')
    await options.first().waitFor({ state: 'visible' })
    await options.first().click()
    await page.getByRole('button', { name: 'Submit Answer' }).first().click()
    await expect(page.getByRole('button', { name: 'Submit Answer' })).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect(gridButton(page, 0)).toHaveClass(/bg-(primary|green|red)/)

    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible()

    // Reload mid-flow: resume lands on question 2; question 1 is never revisited.
    await page.reload()
    await expect(page).toHaveURL(SESSION_ID_URL)
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })

    await expect(gridButton(page, 0)).toHaveClass(GRADED_CLASS, { timeout: 10_000 })
    await expect(gridButton(page, 1)).not.toHaveClass(GRADED_CLASS)
  })
})
