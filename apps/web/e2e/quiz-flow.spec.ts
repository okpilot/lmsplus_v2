import { expect, test } from '@playwright/test'

// Use saved auth state from setup
test.use({ storageState: 'e2e/.auth/user.json' })

test('quiz flow: configure → answer questions → view results → dashboard', async ({ page }) => {
  // 1. Navigate to quiz config
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

  // 2. Select the first subject from dropdown
  const subjectSelect = page.locator('#subject')
  await subjectSelect.waitFor({ state: 'visible' })
  const options = subjectSelect.locator('option')
  const optionCount = await options.count()
  expect(optionCount).toBeGreaterThan(1) // at least one subject + the placeholder

  // Select the first real subject (index 1 since index 0 is "Select a subject...")
  await subjectSelect.selectOption({ index: 1 })

  // 3. Set question count to 3 (small for fast tests)
  const countInput = page.locator('#count')
  await countInput.fill('3')

  // 4. Start quiz
  await page.getByRole('button', { name: 'Start Quiz' }).click()

  // 5. Wait for quiz session to load
  await page.waitForURL('**/app/quiz/session', { timeout: 10_000 })
  await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })

  // 6. Answer all 3 questions (deferred writes — no per-answer feedback)
  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(`Question ${i + 1}`)).toBeVisible()

    // Click the first answer option
    const answerButtons = page.locator('button:has(span.rounded-full)')
    await answerButtons.first().waitFor({ state: 'visible' })
    await answerButtons.first().click()

    // Click Submit Answer (locks selection locally, no server call)
    await page.getByRole('button', { name: 'Submit Answer' }).click()

    // Navigate to next question (or finish on the last one)
    if (i < 2) {
      await page.getByRole('button', { name: 'Next' }).click()
    }
  }

  // 7. Open finish dialog and submit
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await expect(page.getByText('Finish Quiz')).toBeVisible()
  await page.getByRole('button', { name: 'Submit Quiz' }).click()

  // 8. Should redirect to quiz report page
  await page.waitForURL('**/app/quiz/report**', { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Quiz Report' })).toBeVisible()
  await expect(page.getByText('%')).toBeVisible() // score percentage
  await expect(page.getByRole('link', { name: 'Back to Dashboard' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start Another Quiz' })).toBeVisible()

  // 9. Navigate back to dashboard
  await page.getByRole('link', { name: 'Back to Dashboard' }).click()
  await page.waitForURL('**/app/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
