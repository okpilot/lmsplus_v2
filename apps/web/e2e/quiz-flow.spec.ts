import { expect, test } from '@playwright/test'

// Use saved auth state from setup
test.use({ storageState: 'e2e/.auth/user.json' })

test('quiz flow: configure → answer questions → view results → dashboard', async ({ page }) => {
  // 1. Navigate to quiz config
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

  // 2. Select the first subject from the shadcn Select dropdown
  const subjectTrigger = page.locator('[data-slot="select-trigger"]')
  await subjectTrigger.waitFor({ state: 'visible' })
  await subjectTrigger.click()
  await page.locator('[data-slot="select-item"]').first().click()

  // 3. Set question count to 3 via slider keyboard control
  const sliderThumb = page.locator('[data-slot="slider-thumb"]')
  await sliderThumb.waitFor({ state: 'visible' })
  await sliderThumb.click()
  await sliderThumb.press('Home') // go to min (1)
  await sliderThumb.press('ArrowRight')
  await sliderThumb.press('ArrowRight') // now at 3

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

  // 7. Wait for all answers to flush, then open finish dialog and submit
  await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('style', /100%/)
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await expect(page.getByRole('dialog', { name: 'Finish quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Submit Quiz' }).click()

  // 8. Should redirect to quiz report page
  await page.waitForURL('**/app/quiz/report**', { timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Quiz Report' })).toBeVisible()
  await expect(page.getByText('Your Score')).toBeVisible()
  await expect(page.locator('.text-5xl').getByText(/\d+%/)).toBeVisible() // score percentage
  await expect(page.getByRole('link', { name: 'Back to Dashboard' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start Another Quiz' })).toBeVisible()

  // 9. Navigate back to dashboard
  await page.getByRole('link', { name: 'Back to Dashboard' }).click()
  await page.waitForURL('**/app/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
