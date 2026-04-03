import { expect, type Page, test } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

/**
 * Start a quiz with all available questions, answer `answerCount` of them,
 * then navigate away. Leaves recovery data in localStorage.
 * Returns the total question count for assertions.
 */
async function startAndAbandonQuiz(
  page: Page,
  answerCount: number,
): Promise<{ totalQuestions: number }> {
  await page.goto('/app/quiz')

  // Clear stale recovery data
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('quiz-active-session:')) localStorage.removeItem(key)
    }
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

  // Configure: select first subject, all available questions
  const subjectTrigger = page.locator('[data-slot="select-trigger"]')
  await subjectTrigger.waitFor({ state: 'visible' })
  await subjectTrigger.click()
  await page.locator('[data-slot="select-item"]').first().click()

  // Use "All" button (never disabled, works regardless of question count)
  await page.getByRole('button', { name: 'All' }).click()

  // Read total from "of N selected" text and verify enough questions exist
  const selectedText = await page.getByText(/of \d+ selected/).textContent()
  const totalQuestions = Number(selectedText?.match(/of (\d+) selected/)?.[1] ?? 0)
  expect(totalQuestions).toBeGreaterThanOrEqual(
    answerCount + 1,
    `Need at least ${answerCount + 1} questions (found ${totalQuestions}) for this test`,
  )

  await page.getByRole('button', { name: 'Start Quiz' }).click()

  // Wait for quiz session to load
  await page.waitForURL('**/app/quiz/session', { timeout: 10_000 })
  await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })

  // Answer questions (must be < totalQuestions so Next button always appears)
  for (let i = 0; i < answerCount; i++) {
    const answerBtns = page.locator('button:has(span.rounded-full)')
    await answerBtns.first().waitFor({ state: 'visible' })
    await answerBtns.first().click()
    await page.getByRole('button', { name: 'Submit Answer' }).first().click()

    // Wait for the answer to be processed (Next button appears)
    const nextBtn = page.getByRole('button', { name: 'Next ›' })
    await nextBtn.waitFor({ state: 'visible', timeout: 10_000 })

    if (i < answerCount - 1) {
      await nextBtn.click()
    }
  }

  // Abandon: navigate away — localStorage recovery data persists
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

  return { totalQuestions }
}

test.describe('Quiz Session Recovery', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('quiz-active-session:')) localStorage.removeItem(key)
      }
    })
  })

  // ── 1. Recovery banner: resume ────────────────────────────────────

  test('recovery banner appears after abandoning quiz and resume restores state', async ({
    page,
  }) => {
    const { totalQuestions } = await startAndAbandonQuiz(page, 2)

    // Recovery banner should show correct progress
    await expect(page.getByText('Unfinished quiz found')).toBeVisible()
    await expect(
      page.getByText(new RegExp(`2 of ${totalQuestions} questions answered`)),
    ).toBeVisible()

    // Click Resume
    await page.getByRole('button', { name: 'Resume' }).click()

    // Should navigate to session page at last answered question (Q2)
    await page.waitForURL('**/app/quiz/session', { timeout: 10_000 })
    await expect(page.getByText(`Question 2 of ${totalQuestions}`)).toBeVisible({ timeout: 10_000 })

    // Can continue to the next unanswered question
    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText(`Question 3 of ${totalQuestions}`)).toBeVisible()
  })

  // ── 2. Recovery banner: discard ───────────────────────────────────

  test('discard from recovery banner clears session data', async ({ page }) => {
    await startAndAbandonQuiz(page, 2)

    await expect(page.getByText('Unfinished quiz found')).toBeVisible()

    // Click Discard — opens confirmation dialog, then confirm
    await page.getByRole('button', { name: /^Discard$/i }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Discard$/i })
      .click()

    // Banner should disappear
    await expect(page.getByText('Unfinished quiz found')).not.toBeVisible()

    // localStorage should be cleared
    const hasRecovery = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith('quiz-active-session:')),
    )
    expect(hasRecovery).toBe(false)
  })

  // ── 3. Recovery banner: save for later ────────────────────────────

  test('save for later from recovery banner saves draft and clears data', async ({ page }) => {
    await startAndAbandonQuiz(page, 2)

    await expect(page.getByText('Unfinished quiz found')).toBeVisible()

    // Click Save for Later
    await page.getByRole('button', { name: 'Save for Later' }).click()

    // Banner should disappear after the draft is saved
    await expect(page.getByText('Unfinished quiz found')).not.toBeVisible({ timeout: 10_000 })

    // localStorage should be cleared
    const hasRecovery = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith('quiz-active-session:')),
    )
    expect(hasRecovery).toBe(false)
  })

  // ── 4. Confirm dialog on new quiz start ───────────────────────────

  test('confirm dialog when starting new quiz with existing recovery data', async ({ page }) => {
    await startAndAbandonQuiz(page, 2)

    await expect(page.getByText('Unfinished quiz found')).toBeVisible()

    // Configure a new quiz
    const subjectTrigger = page.locator('[data-slot="select-trigger"]')
    await subjectTrigger.click()
    await page.locator('[data-slot="select-item"]').first().click()
    await page.getByRole('button', { name: 'All' }).click()

    // First attempt: Playwright auto-dismisses confirm (returns false) → stays on page
    await page.getByRole('button', { name: 'Start Quiz' }).click()
    await expect(page).toHaveURL(/\/app\/quiz$/)
    await expect(page.getByText('Unfinished quiz found')).toBeVisible()

    // Second attempt: accept the confirm → starts new quiz
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Start Quiz' }).click()
    await page.waitForURL('**/app/quiz/session', { timeout: 10_000 })
    await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })
  })

  // ── 5. Session page: recovery prompt + resume ─────────────────────

  test('session page shows recovery prompt and resume works', async ({ page }) => {
    const { totalQuestions } = await startAndAbandonQuiz(page, 2)

    // Clear sessionStorage to simulate closed tab / new tab
    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('quiz-session:')) sessionStorage.removeItem(key)
      }
    })

    // Navigate directly to session page
    await page.goto('/app/quiz/session')

    // Should show the in-page recovery prompt
    await expect(page.getByRole('heading', { name: 'Resume your quiz?' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      page.getByText(new RegExp(`2 of ${totalQuestions} questions answered`)),
    ).toBeVisible()

    // Click Resume — loads questions and renders quiz at saved position
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByText(`Question 2 of ${totalQuestions}`)).toBeVisible({ timeout: 10_000 })

    // Can continue to next question
    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText(`Question 3 of ${totalQuestions}`)).toBeVisible()
  })

  // ── 6. Session page: recovery prompt + discard ────────────────────

  test('session page recovery discard redirects to quiz config', async ({ page }) => {
    await startAndAbandonQuiz(page, 2)

    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('quiz-session:')) sessionStorage.removeItem(key)
      }
    })
    await page.goto('/app/quiz/session')

    await expect(page.getByRole('heading', { name: 'Resume your quiz?' })).toBeVisible({
      timeout: 10_000,
    })

    // Click Discard — opens confirmation dialog, then confirm
    await page.getByRole('button', { name: /^Discard$/i }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Discard$/i })
      .click()
    await page.waitForURL('**/app/quiz', { timeout: 10_000 })

    // No recovery banner (data was cleared)
    await expect(page.getByText('Unfinished quiz found')).not.toBeVisible()
  })
})
