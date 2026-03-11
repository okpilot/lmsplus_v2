import { expect, test } from '@playwright/test'

// Use saved auth state from setup
test.use({ storageState: 'e2e/.auth/user.json' })

test('review flow: start review → answer questions → view results → dashboard', async ({
  page,
}) => {
  // 1. Navigate to review page
  await page.goto('/app/review')
  await expect(page.getByRole('heading', { name: 'Smart Review' })).toBeVisible()

  // 2. Start review session
  await page.getByRole('button', { name: /Start.*Review/i }).click()

  // 3. Wait for review session to load
  await page.waitForURL('**/app/review/session', { timeout: 10_000 })
  await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })

  // 4. Answer at least 2 questions (review loads up to 20, answer a few)
  const questionsToAnswer = 2
  for (let i = 0; i < questionsToAnswer; i++) {
    // Wait for question text
    await expect(page.getByText(`Question ${i + 1}`)).toBeVisible()

    // Click the first answer option
    const answerButtons = page.locator('button:has(span.rounded-full)')
    const firstAnswer = answerButtons.first()
    await firstAnswer.waitFor({ state: 'visible' })
    await firstAnswer.click()

    // Submit answer
    await page.getByRole('button', { name: 'Submit Answer' }).click()

    // Wait for feedback
    await expect(page.getByText(/Correct!|Incorrect/).first()).toBeVisible({ timeout: 5_000 })

    // Click Next Question
    await page.getByRole('button', { name: /Next Question/ }).click()
  }

  // 5. After answering some questions, end the session early if possible
  // The session may show another question or the summary — handle both
  const summaryVisible = await page
    .getByText('Smart Review Complete')
    .isVisible()
    .catch(() => false)
  if (!summaryVisible) {
    // Still in the middle of session — answer remaining questions until complete
    // Or check if there's an "End Session" button
    let complete = false
    for (let i = questionsToAnswer; i < 20 && !complete; i++) {
      const questionVisible = await page
        .getByText(`Question ${i + 1}`)
        .isVisible()
        .catch(() => false)
      if (!questionVisible) {
        complete = true
        break
      }

      const answerButtons = page.locator('button:has(span.rounded-full)')
      await answerButtons.first().click()
      await page.getByRole('button', { name: 'Submit Answer' }).click()
      await expect(page.getByText(/Correct!|Incorrect/).first()).toBeVisible({ timeout: 5_000 })
      await page.getByRole('button', { name: /Next Question/ }).click()
    }
  }

  // 6. Should show session summary
  await expect(page.getByText('Smart Review Complete')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('%')).toBeVisible() // score percentage
  await expect(page.getByRole('link', { name: 'Back to Dashboard' })).toBeVisible()

  // 7. Navigate back to dashboard
  await page.getByRole('link', { name: 'Back to Dashboard' }).click()
  await page.waitForURL('**/app/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
