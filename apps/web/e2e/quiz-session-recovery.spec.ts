import { expect, type Page, test } from '@playwright/test'
import {
  clearQuizActiveSessionKeys,
  startStudyQuiz,
  submitFirstOption,
} from './helpers/quiz-session'
import {
  readSessionRow,
  resetStudentQuizSessions,
  SESSION_ID_URL,
  sessionIdFromUrl,
} from './helpers/quiz-session-id'
import { readUserId } from './helpers/recovery-code'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

type Abandoned = { sessionId: string; sessionUrl: string; total: number }

/**
 * Starts a quiz with every available question, answers `answerCount` of them, then leaves the
 * runner. The session stays open on the server: it is what the Unfinished banner offers back.
 */
async function startAndAbandonQuiz(page: Page, answerCount: number): Promise<Abandoned> {
  const total = await startStudyQuiz(page)
  expect(total).toBeGreaterThanOrEqual(answerCount + 1)
  const sessionUrl = page.url()
  for (let i = 0; i < answerCount; i++) {
    await submitFirstOption(page)
    // Submit stays visible while the check is in flight; it unmounts once feedback is recorded.
    await expect(page.getByRole('button', { name: 'Submit Answer' })).toHaveCount(0, {
      timeout: 10_000,
    })
    if (i < answerCount - 1) await page.getByRole('button', { name: 'Next ›' }).click()
  }
  const sessionId = sessionIdFromUrl(sessionUrl)
  await expect
    .poll(async () => (await readSessionRow(sessionId)).currentIndex, { timeout: 10_000 })
    .toBe(answerCount - 1)

  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
  return { sessionId, sessionUrl, total }
}

async function saveForLater(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await expect(page.getByRole('dialog', { name: 'Finish quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Save for Later' }).click()
  await page.waitForURL(/\/app\/quiz$/, { timeout: 15_000 })
}

test.describe('Quiz Session Recovery', () => {
  // The user.json identity (TEST_EMAIL) is shared across this project's specs and each test
  // abandons a quiz, leaving an open quiz_sessions row. Under the single-active-session
  // invariant (#1011) a leftover one makes the next Start Quiz fail with
  // `another_session_active`, and saved sessions count toward the 20-quiz cap. Clear both
  // before and after each test.
  test.beforeEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test.afterEach(async ({ page }) => {
    const errors: string[] = []
    try {
      await clearQuizActiveSessionKeys(page)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await resetStudentQuizSessions(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  // ── 1. Unfinished banner: resume ──────────────────────────────────

  test('the Unfinished banner shows the abandoned quiz and Resume reopens it at its last position', async ({
    page,
  }) => {
    const { sessionUrl, total } = await startAndAbandonQuiz(page, 2)

    await expect(page.getByText('Unfinished Quick Quiz session', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Resume', exact: true }).click()

    await page.waitForURL(SESSION_ID_URL, { timeout: 10_000 })
    expect(page.url()).toBe(sessionUrl)
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'Resume your quiz?' })).toHaveCount(0)

    // Can continue to the next unanswered question
    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText(`Question 3 of ${total}`)).toBeVisible()
  })

  // ── 2. Unfinished banner: discard ─────────────────────────────────

  test('Discard from the Unfinished banner discards the session and clears the legacy local copy', async ({
    page,
  }) => {
    const { sessionId } = await startAndAbandonQuiz(page, 2)
    const userId = await readUserId(TEST_EMAIL)
    const key = `quiz-active-session:${userId}`
    await page.evaluate((k) => localStorage.setItem(k, '{}'), key)
    await expect(page.getByText('Unfinished Quick Quiz session', { exact: true })).toBeVisible()
    expect((await readSessionRow(sessionId)).deletedAt).toBeNull()

    // Discard opens a confirmation dialog, then the dialog's own Discard confirms.
    await page.getByRole('button', { name: /^Discard$/ }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Discard$/ })
      .click()

    await expect(page.getByText('Unfinished Quick Quiz session', { exact: true })).toHaveCount(0)
    await expect.poll(async () => (await readSessionRow(sessionId)).deletedAt).not.toBeNull()
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull()
  })

  // ── 3. Saved tab: delete ──────────────────────────────────────────

  test('Delete in the Saved tab removes a saved quiz and frees its saved slot', async ({
    page,
  }) => {
    const { sessionId, total } = await startAndAbandonQuiz(page, 2)
    await page.goto(`/app/quiz/session/${sessionId}`)
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await saveForLater(page)
    await page.getByTestId('tab-saved').click()
    await expect(page.getByText(`2 of ${total} answered`)).toBeVisible()
    expect((await readSessionRow(sessionId)).savedAt).not.toBeNull()

    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByTestId('delete-saved-session').click()

    await expect(page.getByTestId('resume-saved-session')).toHaveCount(0)
    await expect.poll(async () => (await readSessionRow(sessionId)).savedAt).toBeNull()
  })

  // ── 4. Saved session URL: the Saved quiz page ─────────────────────

  test('opening the URL of a saved quiz shows its Saved quiz page and Resume reopens it', async ({
    page,
  }) => {
    const { sessionId, sessionUrl, total } = await startAndAbandonQuiz(page, 2)
    await page.goto(sessionUrl)
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await saveForLater(page)

    await page.goto(sessionUrl)
    await expect(page.getByRole('heading', { name: 'Saved quiz' })).toBeVisible()
    await expect(page.getByText(`2 of ${total} answered`)).toBeVisible()
    await page.getByRole('button', { name: 'Resume', exact: true }).click()

    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    expect(page.url()).toBe(sessionUrl)
    expect((await readSessionRow(sessionId)).savedAt).toBeNull()
  })

  // ── 5. Saved session URL: delete ──────────────────────────────────

  test('Delete on the Saved quiz page returns to the quiz page without the quiz', async ({
    page,
  }) => {
    const { sessionId, sessionUrl, total } = await startAndAbandonQuiz(page, 2)
    await page.goto(sessionUrl)
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await saveForLater(page)
    await page.goto(sessionUrl)
    await expect(page.getByRole('heading', { name: 'Saved quiz' })).toBeVisible()

    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await page.waitForURL(/\/app\/quiz$/, { timeout: 10_000 })
    await expect.poll(async () => (await readSessionRow(sessionId)).savedAt).toBeNull()
    await page.getByTestId('tab-saved').click()
    await expect(page.getByTestId('resume-saved-session')).toHaveCount(0)
  })

  test('declining Delete on the Saved quiz page keeps the saved quiz and its page', async ({
    page,
  }) => {
    const { sessionId, sessionUrl, total } = await startAndAbandonQuiz(page, 2)
    await page.goto(sessionUrl)
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await saveForLater(page)
    await page.goto(sessionUrl)
    await expect(page.getByRole('heading', { name: 'Saved quiz' })).toBeVisible()

    page.once('dialog', (dialog) => void dialog.dismiss())
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Saved quiz' })).toBeVisible()
    expect(page.url()).toBe(sessionUrl)
    expect((await readSessionRow(sessionId)).savedAt).not.toBeNull()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Saved quiz' })).toBeVisible()
  })
})
