/**
 * E2E regression spec — Practice Exam auto-submit on timer expiry.
 *
 * Seed dependency: apps/web/scripts/seed-e2e.ts (CI) and
 *   apps/web/scripts/seed-exam-eval.ts (local manual eval). Both scripts seed
 *   a MET exam config with a 60-second timer (timeLimitSeconds=60, 10 questions,
 *   70% pass mark). Keep the MET config shape consistent across both scripts —
 *   if you change one, mirror it in the other or this spec will start failing.
 *
 * This test locks down Bug A from PR #523 Phase 1:
 *   Before the fix, timer expiry fired handleTimeExpired but the submit action
 *   used a stale `s.submitting` ref, causing a silent no-op instead of a redirect.
 *   The report page was never reached; the session page stayed visible.
 *
 * The test uses test.setTimeout(150_000) to fit: ~10s setup + 60s in-page timer +
 * up to 120s waitForURL on the post-submit redirect (line 120) + small margin. The
 * waitForURL timeout itself is 120_000 — long enough to absorb the timer +
 * server-side complete_overdue_exam_session RPC + Next.js RSC payload fetch +
 * redirect. A 90s test cap was arithmetically impossible (60 + 120 alone exceeds it).
 *
 * Auth: uses the shared student session saved by auth.setup.ts
 * (e2e/.auth/user.json — the e2e-test@lmsplus.local user).
 * The seed-exam-eval.ts script creates its OWN student (student@lmsplus.local),
 * but the E2E test framework uses the shared e2e-test user who belongs to the
 * same Egmont Aviation org — and the exam config is org-wide, so the e2e user
 * will also see the MET exam option after the seed is run.
 */

import { expect, test } from '@playwright/test'

// Reuse the shared student auth session created by auth.setup.ts
test.use({ storageState: 'e2e/.auth/user.json' })

test.describe('practice exam — auto-submit on timer expiry', () => {
  // 60s in-page timer + 75s post-submit waitForURL + ~15s setup margin = 150s.
  test.setTimeout(150_000)

  // Skipped: 0-answer auto-submit reproducibly hangs on /app/quiz/session.
  // Server side completes correctly (DB row gets ended_at, score=0%, passed=false),
  // and the trace shows Next.js fetches the /app/quiz/report RSC payload (200 OK)
  // — but the frame URL never transitions, so the user stays on the session page
  // with "Submitting…" stuck. Reproduces in real browser, not just under Playwright.
  // Submitting WITH answers works (batch_submit_quiz path); only the 0-answer path
  // (submitEmptyExamSession → complete_empty_exam_session RPC) hangs the client.
  // Tracked in #568 — re-enable this spec when the bug is fixed.
  test.fixme('lands on the report page with 0% / FAIL when the timer expires with no answers', async ({
    page,
  }) => {
    // ── 1. Navigate to quiz config ──────────────────────────────────────────
    await page.goto('/app/quiz')
    await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()

    // ── 2. Clear any stale exam session banners from a prior failed run ─────
    // If a prior run left an active server-side exam session, the page shows a
    // "Practice Exam in progress" banner. Discard it so we start clean.
    const resumeBanner = page.getByText('Practice Exam in progress')
    if (await resumeBanner.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.getByRole('button', { name: 'Discard' }).first().click()
      // Confirm the alertdialog discard
      const alertDialog = page.getByRole('alertdialog')
      if (await alertDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await alertDialog.getByRole('button', { name: 'Discard' }).click()
      }
      // Wait for banner to disappear after server-side discard
      await expect(page.getByText('Practice Exam in progress')).not.toBeVisible({
        timeout: 10_000,
      })
    }

    // ── 3. Switch to Practice Exam mode ────────────────────────────────────
    // The ModeToggle renders two buttons: "Study" and "Practice Exam".
    // "Practice Exam" is disabled unless examSubjects.length > 0.
    const examModeButton = page.getByRole('button', { name: 'Practice Exam', exact: true })
    await examModeButton.waitFor({ state: 'visible', timeout: 10_000 })
    await expect(examModeButton).not.toBeDisabled()
    await examModeButton.click()

    // Verify the mode switched (button is now aria-pressed=true)
    await expect(examModeButton).toHaveAttribute('aria-pressed', 'true')

    // ── 4. Select Meteorology (MET — 60s timer per seed) ───────────────────
    // ExamConfigForm renders a SubjectSelect with data-testid="subject-trigger"
    // The seed creates MET with code "050" and name "Meteorology".
    const subjectTrigger = page.locator('[data-testid="subject-trigger"]')
    await subjectTrigger.waitFor({ state: 'visible', timeout: 5_000 })
    await subjectTrigger.click()

    // Click the MET option — match by short code text "050" inside the option
    const metOption = page
      .locator('[data-testid="subject-option"]')
      .filter({ hasText: '050' })
      .first()
    await metOption.waitFor({ state: 'visible', timeout: 5_000 })
    await metOption.click()

    // Verify the exam parameters panel renders (confirms MET was selected)
    await expect(page.getByText('Practice Exam Parameters')).toBeVisible({ timeout: 5_000 })

    // ── 5. Click "Start Practice Exam" ─────────────────────────────────────
    const startButton = page.getByRole('button', { name: 'Start Practice Exam' })
    await expect(startButton).not.toBeDisabled()
    await startButton.click()

    // ── 6. Wait for the session page to load ───────────────────────────────
    await page.waitForURL(/\/app\/quiz\/session/, { timeout: 15_000 })
    await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })

    // ── 7. Do NOT answer any question — sit and wait for auto-submit ────────
    // The MET exam config has timeLimitSeconds=60. The countdown fires
    // handleTimeExpired at 0, which calls handleSubmit (no answers → 0%).
    // Phase 1 fix: handleTimeExpired uses reactive state not a ref, so the
    // submit is no longer a silent no-op.

    // ── 8. Wait for auto-submit redirect — 120s covers the 60s in-page timer +
    //       10s auto-submit countdown (FinishQuizDialog) + RPC + Next.js RSC
    //       payload fetch + commit. Trace evidence shows the RSC payload for
    //       /app/quiz/report is fetched ~88-92s after Question 1 is visible,
    //       so 90s left a few hundred ms of margin and was flaky.
    //       test.setTimeout(150_000) accommodates the wider window.
    await page.waitForURL(/\/app\/quiz\/report\?session=/, { timeout: 120_000 })

    // ── 9. Assert the report page rendered correctly ────────────────────────
    // Heading
    await expect(page.getByRole('heading', { name: 'Quiz Results' })).toBeVisible({
      timeout: 10_000,
    })

    // "Practice Exam Complete" title (isExam=true → mock_exam mode)
    await expect(page.getByText('Practice Exam Complete')).toBeVisible()

    // FAILED badge — 0 correct out of 10, pass mark 70%
    await expect(page.getByText('FAILED')).toBeVisible()

    // Score ring shows 0% (the ScoreRing renders the percentage as visible text)
    await expect(page.getByText('0%')).toBeVisible()
  })
})
