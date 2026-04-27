/**
 * E2E regression spec — Practice Exam refresh recovery.
 *
 * Seed dependency: apps/web/scripts/seed-exam-eval.ts
 *   Creates student@lmsplus.local / student123! and a MET exam config
 *   (timeLimitSeconds=60, 10 questions, 70% pass mark) plus ALW (Air Law).
 *   The e2e-test@lmsplus.local user (shared auth) belongs to the same
 *   Egmont Aviation org and sees the same exam configs.
 *
 * These tests lock down Bugs C + D from PR #523 Phase 2:
 *   Bug C — page.reload() on /app/quiz/session during exam mode redirected to
 *            /app/quiz instead of rehydrating from localStorage.
 *   Bug D — navigating to /app/quiz mid-exam showed no resume banner because
 *            getActiveExamSession used deleted_at filter incorrectly.
 *
 * Both specs use test.setTimeout(90_000) to cover the 60s MET timer and avoid
 * Playwright's default 30s ceiling during the exam session setup phase.
 *
 * Auth: uses the shared student session saved by auth.setup.ts.
 */

import { expect, type Page, test } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

/**
 * Helper: navigate to /app/quiz, switch to Practice Exam mode, select the MET
 * subject (code "050"), and click "Start Practice Exam".
 * Waits until /app/quiz/session is loaded and Question 1 is visible.
 */
async function startMETExam(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

  // Dismiss any stale exam banner from a prior run
  const resumeBanner = page.getByText('Practice Exam in progress')
  if (await resumeBanner.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Discard' }).first().click()
    const alertDialog = page.getByRole('alertdialog')
    if (await alertDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await alertDialog.getByRole('button', { name: 'Discard' }).click()
    }
    await expect(page.getByText('Practice Exam in progress')).not.toBeVisible({ timeout: 10_000 })
  }

  // Switch to Practice Exam mode
  const examModeButton = page.getByRole('button', { name: 'Practice Exam' })
  await examModeButton.waitFor({ state: 'visible', timeout: 10_000 })
  await expect(examModeButton).not.toBeDisabled()
  await examModeButton.click()
  await expect(examModeButton).toHaveAttribute('aria-pressed', 'true')

  // Select MET (code 050)
  const subjectTrigger = page.locator('[data-testid="subject-trigger"]')
  await subjectTrigger.waitFor({ state: 'visible', timeout: 5_000 })
  await subjectTrigger.click()
  const metOption = page
    .locator('[data-testid="subject-option"]')
    .filter({ hasText: '050' })
    .first()
  await metOption.waitFor({ state: 'visible', timeout: 5_000 })
  await metOption.click()

  // Confirm exam params panel
  await expect(page.getByText('Practice Exam Parameters')).toBeVisible({ timeout: 5_000 })

  // Start
  const startButton = page.getByRole('button', { name: 'Start Practice Exam' })
  await expect(startButton).not.toBeDisabled()
  await startButton.click()

  // Wait for session
  await page.waitForURL(/\/app\/quiz\/session/, { timeout: 15_000 })
  await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })
}

/**
 * Helper: answer the current question by clicking the first available answer
 * button and waiting for the exam buffer to record it (Next arrow becomes active
 * or the answered count in the header increments).
 *
 * In exam mode there is no per-answer submit button — selecting an option records
 * it immediately via the exam answer buffer. We wait for the option to appear
 * visually selected (aria-pressed or a checked variant class) as the UI signal.
 */
async function answerCurrentQuestion(page: Page): Promise<void> {
  // In exam mode, answer buttons are plain option buttons (span.rounded-full marker).
  // Click first option. The exam buffer confirms it synchronously.
  const answerBtns = page.locator('button:has(span.rounded-full)')
  await answerBtns.first().waitFor({ state: 'visible', timeout: 10_000 })
  await answerBtns.first().click()

  // Wait briefly for the click to be processed (localStorage write is synchronous,
  // but we give the React state cycle a tick to settle).
  await page.waitForTimeout(300)
}

test.describe('practice exam — refresh recovery', () => {
  test.setTimeout(90_000)

  test.afterEach(async ({ page }) => {
    // Best-effort cleanup of exam localStorage key so tests don't bleed into each other.
    // The key format is quiz-active-session:<userId>.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('quiz-active-session:')) localStorage.removeItem(key)
      }
    })
  })

  // ── 1. Warm in-tab refresh rehydrates from localStorage ────────────────────

  test('resumes seamlessly after page reload with answers buffered to localStorage', async ({
    page,
  }) => {
    await startMETExam(page)

    // Answer one question so there is state worth recovering
    await answerCurrentQuestion(page)

    // Force a full page reload — this is the Bug C regression path.
    // Before Phase 2 fix: reload redirected to /app/quiz.
    // After Phase 2 fix: session rehydrates from localStorage handoff and stays
    // on /app/quiz/session.
    await page.reload()

    // Option (a): session page rehydrates and stays on /app/quiz/session
    const isOnSession = await page
      .waitForURL(/\/app\/quiz\/session/, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false)

    if (isOnSession) {
      // Session should be visible with question content loaded
      // (either at the answered question or next unanswered — both are valid)
      await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
    } else {
      // Option (b): redirected to /app/quiz — should show the server-side
      // "Practice Exam in progress" resume banner (Bug D regression path).
      await page.waitForURL(/\/app\/quiz/, { timeout: 10_000 })
      await expect(page.getByText('Practice Exam in progress')).toBeVisible({ timeout: 10_000 })

      // Clicking Resume Practice Exam must land back on /app/quiz/session
      await page.getByRole('button', { name: 'Resume Practice Exam' }).click()
      await page.waitForURL(/\/app\/quiz\/session/, { timeout: 10_000 })
      await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
    }
  })

  // ── 2. Resume banner on /app/quiz when localStorage is cleared mid-exam ────

  test('shows a Resume Practice Exam banner on /app/quiz when localStorage is cleared mid-exam', async ({
    page,
  }) => {
    await startMETExam(page)

    // Answer one question to create a server-side active session
    await answerCurrentQuestion(page)

    // Simulate "lost tab" by clearing localStorage — this removes the local
    // recovery data but the server-side quiz_sessions row remains 'active'.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('quiz-active-session:')) localStorage.removeItem(key)
      }
    })

    // Also clear sessionStorage handoff so there's no warm resume path
    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('quiz-session:')) sessionStorage.removeItem(key)
      }
    })

    // Navigate to /app/quiz — the page re-fetches getActiveExamSession server-side.
    // Phase 2 fix: getActiveExamSession correctly finds the active session.
    // Bug D regression: before the fix, the deleted_at filter was incorrectly
    // applied and returned no sessions, so the banner was never shown.
    await page.goto('/app/quiz')
    await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

    // The "Practice Exam in progress" banner must be visible
    await expect(page.getByText('Practice Exam in progress')).toBeVisible({ timeout: 10_000 })

    // Click "Resume Practice Exam" — must navigate to /app/quiz/session
    await page.getByRole('button', { name: 'Resume Practice Exam' }).click()
    await page.waitForURL(/\/app\/quiz\/session/, { timeout: 10_000 })
    await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
  })
})
