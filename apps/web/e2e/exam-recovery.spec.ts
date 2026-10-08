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
 * These tests lock down Bugs C + D from PR #523 Phase 2, on the server-held flow of #1026:
 *   Bug C — page.reload() mid-exam must reopen the exam, not bounce to /app/quiz. The exam's
 *            URL is /app/quiz/session/<id>; the server holds its answers and position.
 *   Bug D — navigating to /app/quiz mid-exam must show the resume banner, whose link opens
 *            the same session URL.
 *
 * Both specs use test.setTimeout(90_000) to cover the 60s MET timer and avoid
 * Playwright's default 30s ceiling during the exam session setup phase.
 *
 * Auth: uses the shared student session saved by auth.setup.ts.
 */

import { expect, type Page, test } from '@playwright/test'
import { acceptBeforeUnload } from './helpers/before-unload'
import { readServerAnsweredCount } from './helpers/quiz-session'
import { SESSION_ID_URL } from './helpers/quiz-session-id'
import { getAdminClient, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

// The runner arms a native leave prompt; an unhandled one cancels reload() and goto().
test.beforeEach(({ page }) => {
  acceptBeforeUnload(page)
})

/**
 * Helper: navigate to /app/quiz, switch to Practice Exam mode, select the MET
 * subject (code "050"), and click "Start Practice Exam".
 * Waits until /app/quiz/session/<id> is loaded and Question 1 is visible.
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
  await page.waitForURL(SESSION_ID_URL, { timeout: 15_000 })
  await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })
}

/**
 * Helper: answer the current question. In exam mode the answer is only recorded once
 * "Confirm Answer" is pressed; the confirmed option locks (disabled, no correctness shown).
 */
async function answerCurrentQuestion(page: Page): Promise<void> {
  const firstOption = page.locator('button:has(span.rounded-full)').first()
  await firstOption.waitFor({ state: 'visible', timeout: 10_000 })
  await firstOption.click()
  await expect(firstOption).toHaveAttribute('data-selected', 'true')
  await page.getByRole('button', { name: 'Confirm Answer' }).click()
  await expect(firstOption).toBeDisabled()
}

test.describe('practice exam — refresh recovery', () => {
  test.setTimeout(90_000)

  test.afterEach(async () => {
    // Soft-delete any leftover server-side mock_exam quiz_sessions for the shared
    // test user so the next spec doesn't see a stale "Resume Practice Exam" banner
    // (which would race with the regular "Resume" banner and trip strict-mode locator).
    const admin = getAdminClient()
    const errors: string[] = []

    // Step 1: resolve the test user
    let userId: string | undefined
    try {
      const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
      if (listError) throw new Error(`afterEach listUsers: ${listError.message}`)
      const user = existingUsers?.users.find((u: { email?: string }) => u.email === TEST_EMAIL)
      userId = user?.id
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }

    // Step 2: soft-delete mock_exam quiz_sessions for the resolved user
    if (userId) {
      try {
        const { error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('student_id', userId)
          .eq('mode', 'mock_exam')
          .is('ended_at', null)
          .is('deleted_at', null)
        if (error) throw new Error(`afterEach soft-delete mock_exam sessions: ${error.message}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }

    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  // ── 1. Reload reopens the same exam from the server ────────────────────────

  test('reloading mid-exam reopens the same exam URL with the confirmed answer locked', async ({
    page,
  }) => {
    await startMETExam(page)
    const sessionUrl = page.url()
    await answerCurrentQuestion(page)
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)

    // Bug C regression path: reload used to redirect to /app/quiz.
    await page.reload()

    await expect(page).toHaveURL(sessionUrl)
    await expect(page.getByText(/Question 1 of/)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('button:has(span.rounded-full)').first()).toBeDisabled()
    await expect(page.getByText('Practice Exam in progress')).toHaveCount(0)
  })

  // ── 2. Resume banner on /app/quiz when the browser storage is cleared ──────

  test('shows a Resume Practice Exam banner on /app/quiz when browser storage is cleared mid-exam', async ({
    page,
  }) => {
    await startMETExam(page)
    const sessionUrl = page.url()
    await answerCurrentQuestion(page)
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)

    // Simulate a lost tab: nothing is left in this browser, the server row remains open.
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    // Bug D regression: the banner comes from the server (getActiveExamSession).
    await page.goto('/app/quiz')
    await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
    await expect(page.getByText('Practice Exam in progress')).toBeVisible({ timeout: 10_000 })

    // The Resume link opens the exam's own URL, with the answer still in place.
    await page.getByRole('link', { name: 'Resume Practice Exam' }).click()
    await page.waitForURL(SESSION_ID_URL, { timeout: 10_000 })
    expect(page.url()).toBe(sessionUrl)
    await expect(page.getByText(/Question 1 of/)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('button:has(span.rounded-full)').first()).toBeDisabled()
  })
})
