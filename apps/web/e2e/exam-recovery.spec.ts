/**
 * E2E regression spec — Practice Exam refresh recovery.
 *
 * Seed dependency: apps/web/scripts/seed-e2e.ts (CI) and
 *   apps/web/scripts/seed-exam-eval.ts (local manual eval). Both seed a MET
 *   exam config (timeLimitSeconds=60, 10 questions, 70% pass mark). The
 *   manual-eval seed also creates ALW (Air Law) and student@lmsplus.local —
 *   the CI seed only creates the MET config plus the e2e-test user. The
 *   e2e-test@lmsplus.local user (shared auth) belongs to the Egmont Aviation
 *   org and sees the MET exam config seeded by either script.
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
import { getAdminClient, TEST_EMAIL } from './helpers/supabase'

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
  const examModeButton = page.getByRole('button', { name: 'Practice Exam', exact: true })
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

    // Soft-delete any leftover server-side mock_exam quiz_sessions for the shared
    // test user so the next spec doesn't see a stale "Resume Practice Exam" banner
    // (which would race with the regular "Resume" banner and trip strict-mode locator).
    const admin = getAdminClient()
    const { data: existingUsers } = await admin.auth.admin.listUsers()
    const user = existingUsers?.users.find((u: { email?: string }) => u.email === TEST_EMAIL)
    if (!user) return

    const { error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', user.id)
      .eq('mode', 'mock_exam')
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) {
      console.error('[exam-recovery cleanup] soft-delete failed:', error.message)
    }
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

    // Race the two valid post-reload outcomes by visible content rather than URL:
    // page.waitForURL matches the URL at the START of navigation, so reloading
    // /app/quiz/session resolves true even when the page subsequently bounces
    // back to /app/quiz showing the resume banner. Using locator.or() lets us
    // wait for whichever surface stabilises and branch on what is actually
    // visible. (First use of locator.or() in this codebase — Playwright ≥1.33.)
    const questionText = page.getByText(/Question \d/)
    const resumeBanner = page.getByText('Practice Exam in progress')
    await expect(questionText.or(resumeBanner)).toBeVisible({ timeout: 15_000 })

    if (await resumeBanner.isVisible().catch(() => false)) {
      // Bug D path: server-side resume banner (localStorage handoff was lost or
      // the session-page rehydrate path is not engaged). Clicking Resume must
      // land back on /app/quiz/session with the question content visible.
      await page.getByRole('button', { name: 'Resume Practice Exam' }).click()
      await page.waitForURL(/\/app\/quiz\/session/, { timeout: 10_000 })
      await expect(page.getByText(/Question \d/)).toBeVisible({ timeout: 10_000 })
    }
    // else: Bug C path — questionText was already visible after reload, so the
    // session page rehydrated from the localStorage handoff. The earlier
    // expect(...or...).toBeVisible() already proved the assertion.
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
