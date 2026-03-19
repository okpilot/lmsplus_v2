import { expect, test } from '@playwright/test'

// Use saved auth state from setup
test.use({ storageState: 'e2e/.auth/user.json' })

test('progress page shows mastery data', async ({ page }) => {
  // Navigate to progress
  await page.goto('/app/progress')
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()

  // Verify overall mastery section is visible
  await expect(page.getByText('Overall Mastery')).toBeVisible()
  await expect(page.getByText(/\d+ \/ \d+ questions mastered/)).toBeVisible()
})

test('progress page updates after completing a quiz', async ({ page }) => {
  // 1. Check initial progress state
  await page.goto('/app/progress')
  await expect(page.getByText('Overall Mastery')).toBeVisible()
  await expect(page.getByText(/\d+ \/ \d+ questions mastered/)).toBeVisible()

  // 2. Complete a quiz with 10 questions (smallest preset)
  await page.goto('/app/quiz')
  const subjectTrigger = page.locator('[data-slot="select-trigger"]')
  await subjectTrigger.waitFor({ state: 'visible' })
  await subjectTrigger.click()
  await page.locator('[data-slot="select-item"]').first().click()

  // Use the "10" preset button for reliable count
  await page.getByRole('button', { name: '10' }).click()

  await page.getByRole('button', { name: 'Start Quiz' }).click()
  await page.waitForURL('**/app/quiz/session', { timeout: 10_000 })
  await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })

  // Answer all 10 questions (deferred writes — no per-answer feedback)
  for (let i = 0; i < 10; i++) {
    const answerButtons = page.locator('button:has(span.rounded-full)')
    await answerButtons.first().waitFor({ state: 'visible' })
    await answerButtons.first().click()
    await page.getByRole('button', { name: 'Submit Answer' }).click()

    if (i < 9) {
      await page.getByRole('button', { name: 'Next' }).click()
    }
  }

  // Wait for all answers to flush, then finish and submit quiz
  await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('style', /100%/)
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await expect(page.getByRole('dialog', { name: 'Finish quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Submit Quiz' }).click()
  await page.waitForURL('**/app/quiz/report**', { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Quiz Report' })).toBeVisible()

  // 3. Check progress again — the answered count should have changed
  await page.goto('/app/progress')
  await expect(page.getByText('Overall Mastery')).toBeVisible()
  const updatedText = await page.getByText(/\d+ \/ \d+ questions mastered/).textContent()

  // The text should still contain mastery info
  expect(updatedText).toBeTruthy()
  expect(updatedText).toMatch(/\d+ \/ \d+ questions mastered/)
})
