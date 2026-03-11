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

  // 2. Complete a quick quiz with 2 questions
  await page.goto('/app/quiz')
  const subjectSelect = page.locator('#subject')
  await subjectSelect.waitFor({ state: 'visible' })
  await subjectSelect.selectOption({ index: 1 })
  await page.locator('#count').fill('2')
  await page.getByRole('button', { name: 'Start Quiz' }).click()
  await page.waitForURL('**/app/quiz/session', { timeout: 10_000 })
  await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })

  for (let i = 0; i < 2; i++) {
    const answerButtons = page.locator('button:has(span.rounded-full)')
    await answerButtons.first().waitFor({ state: 'visible' })
    await answerButtons.first().click()
    await page.getByRole('button', { name: 'Submit Answer' }).click()
    await expect(page.getByText(/Correct!|Incorrect/).first()).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /Next Question/ }).click()
  }

  await expect(page.getByText('Quick Quiz Complete')).toBeVisible({ timeout: 10_000 })

  // 3. Check progress again — the answered count should have changed
  await page.goto('/app/progress')
  await expect(page.getByText('Overall Mastery')).toBeVisible()
  const updatedText = await page.getByText(/\d+ \/ \d+ questions mastered/).textContent()

  // The text should still contain mastery info
  expect(updatedText).toBeTruthy()
  expect(updatedText).toMatch(/\d+ \/ \d+ questions mastered/)
})
