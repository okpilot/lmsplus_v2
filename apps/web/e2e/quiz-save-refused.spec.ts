import { expect, type Page, test } from '@playwright/test'
import { acceptBeforeUnload } from './helpers/before-unload'
import {
  clearQuizActiveSessionKeys,
  isServerActionPost,
  readServerAnsweredCount,
} from './helpers/quiz-session'
import { cleanupStudentActiveSessions, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

// The runner arms a native leave prompt; an unhandled one cancels reload() and goto().
test.beforeEach(({ page }) => {
  acceptBeforeUnload(page)
})

// Two automatic resends (2s, then 4s) run before the student is asked.
const AUTO_RETRY_WINDOW_MS = 20_000

const SESSION_URL = /\/app\/quiz\/session\/[0-9a-f-]+$/

/** Starts the seeded MET practice exam, where each confirmed answer is saved in the background. */
async function startPracticeExam(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  const resumeBanner = page.getByText('Practice Exam in progress')
  if (await resumeBanner.isVisible({ timeout: 2_000 }).catch(() => false)) {
    throw new Error('a practice exam is already in progress: cleanup did not run')
  }
  const examMode = page.getByRole('button', { name: 'Practice Exam', exact: true })
  await examMode.click()
  await expect(examMode).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-testid="subject-trigger"]').click()
  await page.locator('[data-testid="subject-option"]').filter({ hasText: '050' }).first().click()
  await page.getByRole('button', { name: 'Start Practice Exam' }).click()
  await page.waitForURL(SESSION_URL, { timeout: 15_000 })
  await expect(page.getByText('Question 1')).toBeVisible({ timeout: 10_000 })
}

async function confirmFirstOption(page: Page): Promise<void> {
  const options = page.locator('button:has(span.rounded-full)')
  await options.first().waitFor({ state: 'visible' })
  await options.first().click()
  await page.getByRole('button', { name: 'Confirm Answer' }).click()
}

/** Fails every Server Action (the answer save) with a 500 until `heal()`. */
async function failAnswerSaves(page: Page) {
  const state = { failing: true, failedPosts: 0 }
  await page.route('**/app/quiz/session**', async (route) => {
    if (!isServerActionPost(route.request())) return route.fallback()
    if (!state.failing) return route.fallback()
    state.failedPosts += 1
    return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' })
  })
  return { state, heal: () => (state.failing = false) }
}

test.describe('Quiz answer save refused by the server', () => {
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test.afterEach(async ({ page, context }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.setOffline(false)
    await clearQuizActiveSessionKeys(page)
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test('asks the student after the automatic resends fail and saves the answer on Try again', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await startPracticeExam(page)
    const sessionUrl = page.url()
    const failing = await failAnswerSaves(page)

    await confirmFirstOption(page)

    const overlay = page.getByRole('alertdialog')
    await expect(overlay.getByText('Your answer was not saved')).toBeVisible({
      timeout: AUTO_RETRY_WINDOW_MS,
    })
    expect(failing.state.failedPosts).toBeGreaterThanOrEqual(3)
    expect(await readServerAnsweredCount()).toBe(0)

    // Try again while the server still refuses: the student is asked again.
    await overlay.getByRole('button', { name: 'Try again' }).click()
    await expect(overlay.getByText('Your answer was not saved')).toBeVisible({ timeout: 10_000 })

    // Reload mid-flow once the server is back: the unsent answer is gone, the session resumes on the same URL.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.reload()
    await expect(page).toHaveURL(sessionUrl)
    await expect(page.getByText(/Question \d+/).first()).toBeVisible({ timeout: 10_000 })
    expect(await readServerAnsweredCount()).toBe(0)

    await confirmFirstOption(page)
    await expect.poll(readServerAnsweredCount, { timeout: 15_000 }).toBe(1)
    await expect(overlay).toHaveCount(0)
  })

  test('Try again after the server recovers closes the prompt and saves the held answer', async ({
    page,
  }) => {
    await startPracticeExam(page)
    const failing = await failAnswerSaves(page)

    await confirmFirstOption(page)
    const overlay = page.getByRole('alertdialog')
    await expect(overlay.getByText('Your answer was not saved')).toBeVisible({
      timeout: AUTO_RETRY_WINDOW_MS,
    })

    failing.heal()
    await overlay.getByRole('button', { name: 'Try again' }).click()
    await expect(overlay).toBeHidden({ timeout: 15_000 })
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)
    await expect(page).toHaveURL(SESSION_URL)
  })

  test('Continue without it closes the prompt, drops the answer and lets the quiz go on', async ({
    page,
  }) => {
    await startPracticeExam(page)
    const sessionUrl = page.url()
    await failAnswerSaves(page)

    await confirmFirstOption(page)
    const overlay = page.getByRole('alertdialog')
    await expect(overlay.getByText('Your answer was not saved')).toBeVisible({
      timeout: AUTO_RETRY_WINDOW_MS,
    })
    await overlay.getByRole('button', { name: 'Continue without it' }).click()
    await expect(overlay).toBeHidden({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText('Question 2')).toBeVisible()
    await expect(page).toHaveURL(sessionUrl)
    expect(await readServerAnsweredCount()).toBe(0)

    // The dropped answer is unlocked: Question 1 can be answered again.
    await page.getByRole('button', { name: '‹ Previous' }).click()
    await expect(page.getByText('Question 1')).toBeVisible()
    const options = page.locator('button:has(span.rounded-full)')
    await expect(options.first()).toBeEnabled()
    await expect(page.locator('[data-selected="true"]')).toHaveCount(0)
  })
})
