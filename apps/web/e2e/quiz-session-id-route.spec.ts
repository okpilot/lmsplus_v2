/**
 * E2E — a quiz is addressed by its session id: /app/quiz/session/<uuid> (#1026 PR 3).
 *
 * The server holds the answers, position and pins, so the URL alone reopens a quiz in any
 * browser. Discovery is the exception and keeps the id-less /app/quiz/session.
 *
 * Auth: the shared student (user.json). A second student (the login-test user) plays the
 * stranger; second browser contexts reuse the shared student's cookies with empty storage.
 */

import { readFileSync } from 'node:fs'
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'
import {
  isServerActionPost,
  readServerAnsweredCount,
  startStudyQuiz,
  submitFirstOption,
} from './helpers/quiz-session'
import {
  readAnsweredQuestionIds,
  readSessionQuestionIds,
  readSessionRow,
  readSessionSubjectName,
  resetStudentQuizSessions,
  SESSION_ID_URL,
  sessionIdFromUrl,
  setSavedVisitTime,
} from './helpers/quiz-session-id'
import { readUserId } from './helpers/recovery-code'
import {
  cleanupStudentActiveSessions,
  ensureLoginTestUser,
  LOGIN_TEST_EMAIL,
  LOGIN_TEST_PASSWORD,
  TEST_EMAIL,
} from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 900 } })

const OPTION = '[data-testid^="option-"]'
const RESULT_CLASS = /border-(green-500|destructive)/
const SUBMIT = 'Submit Answer'
const BLOCKED_OFFER = 'Save quiz for later and start quiz'

const extraContexts: BrowserContext[] = []

/** Answers the visible question with its first option; returns that option's id. */
async function answerCurrent(page: Page): Promise<string> {
  const first = page.locator(OPTION).first()
  await first.waitFor({ state: 'visible' })
  const testId = await first.getAttribute('data-testid')
  if (!testId) throw new Error('first option has no test id')
  await submitFirstOption(page)
  await expect(page.getByRole('button', { name: SUBMIT })).toHaveCount(0, { timeout: 10_000 })
  return testId
}

/** A new browser context holding the shared student's sign-in cookies and nothing else. */
async function openClearedContext(browser: Browser): Promise<Page> {
  const saved = JSON.parse(readFileSync('e2e/.auth/user.json', 'utf8')) as {
    cookies: Parameters<BrowserContext['addCookies']>[0]
  }
  const context = await browser.newContext({
    storageState: { cookies: saved.cookies, origins: [] },
    viewport: { width: 1280, height: 900 },
  })
  extraContexts.push(context)
  return context.newPage()
}

async function openStrangerContext(browser: Browser): Promise<Page> {
  await ensureLoginTestUser()
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1280, height: 900 },
  })
  extraContexts.push(context)
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(LOGIN_TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  return page
}

/** Configures a Study quiz on /app/quiz and presses Start Quiz without waiting for the outcome. */
async function pressStartQuiz(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Study', exact: true }).click()
  await page.locator('[data-testid="subject-trigger"]').click()
  await page.locator('[data-testid="subject-option"]').first().click()
  await page.getByRole('button', { name: 'All' }).click()
  await page.getByRole('button', { name: 'Start Quiz' }).click()
}

async function openSavedTab(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await page.getByTestId('tab-saved').click()
}

async function saveForLater(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await expect(page.getByRole('dialog', { name: 'Finish quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Save for Later' }).click()
  await page.waitForURL(/\/app\/quiz$/, { timeout: 15_000 })
}

test.describe('Quiz session addressed by id', () => {
  test.setTimeout(90_000)

  test.beforeEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test.afterEach(async ({ page }) => {
    const errors: string[] = []
    try {
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('quiz-active-session:')) localStorage.removeItem(key)
        }
      })
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    for (const context of extraContexts.splice(0)) {
      try {
        await context.close()
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    try {
      await resetStudentQuizSessions(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('starting a quiz lands on its own session URL and writes no quiz-session key to sessionStorage', async ({
    page,
  }) => {
    await startStudyQuiz(page)

    await expect(page).toHaveURL(SESSION_ID_URL)
    const keys = await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith('quiz-session:')),
    )
    expect(keys).toEqual([])
  })

  test('reloading restores answers, position and pins with no recovery prompt', async ({
    page,
  }) => {
    const total = await startStudyQuiz(page)
    const sessionUrl = page.url()
    const sessionId = sessionIdFromUrl(sessionUrl)
    const chosen = await answerCurrent(page)
    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible()
    await page.getByTestId('pin-button').click()
    await expect(page.getByTestId('pin-button')).toHaveText(/Unpin/)
    await expect
      .poll(async () => {
        const row = await readSessionRow(sessionId)
        return [row.currentIndex, row.pinnedCount]
      })
      .toEqual([1, 1])

    await page.reload()

    await expect(page).toHaveURL(sessionUrl)
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('pin-button')).toHaveText(/Unpin/)
    await expect(page.getByRole('heading', { name: 'Resume your quiz?' })).toHaveCount(0)
    await page.getByRole('button', { name: '‹ Previous' }).click()
    await expect(page.getByText(`Question 1 of ${total}`)).toBeVisible()
    await expect(page.getByTestId(chosen)).toHaveClass(RESULT_CLASS, { timeout: 10_000 })
  })

  test('a resumed practice question gets its feedback back when viewed', async ({ page }) => {
    const total = await startStudyQuiz(page)
    const chosen = await answerCurrent(page)
    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible()
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)
    await expect
      .poll(async () => (await readSessionRow(sessionIdFromUrl(page.url()))).currentIndex)
      .toBe(1)

    const bodies: string[] = []
    page.on('request', (request) => {
      if (isServerActionPost(request)) bodies.push(request.postData() ?? '')
    })
    await page.reload()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: '‹ Previous' }).click()

    await expect(page.getByTestId(chosen)).toHaveClass(RESULT_CLASS, { timeout: 10_000 })
    await expect(page.locator(`${OPTION}[class*="border-green-500"]`)).toHaveCount(1)
    await expect(page.getByRole('button', { name: SUBMIT })).toHaveCount(0)
    // Control for the exam test below: a practice re-check is visible as a request with the option.
    expect(bodies.some((body) => body.includes('selectedOptionId'))).toBe(true)
  })

  test('a second browser context with cleared storage opens the same URL and sees the same answers and position', async ({
    page,
    browser,
  }) => {
    const total = await startStudyQuiz(page)
    const sessionUrl = page.url()
    const chosen = await answerCurrent(page)
    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible()
    await expect
      .poll(async () => (await readSessionRow(sessionIdFromUrl(sessionUrl))).currentIndex)
      .toBe(1)

    const other = await openClearedContext(browser)
    const storage = await other
      .goto('/app/quiz')
      .then(() => other.evaluate(() => localStorage.length))
    expect(storage).toBe(0)
    await other.goto(sessionUrl)

    await expect(other).toHaveURL(sessionUrl)
    await expect(other.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await other.getByRole('button', { name: '‹ Previous' }).click()
    await expect(other.getByTestId(chosen)).toHaveClass(RESULT_CLASS, { timeout: 10_000 })
  })

  test('the active clock continues from the server total instead of 00:00', async ({ page }) => {
    await startStudyQuiz(page)
    const sessionId = sessionIdFromUrl(page.url())
    await answerCurrent(page)
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)
    const [questionId] = await readAnsweredQuestionIds(sessionId)
    if (!questionId) throw new Error('no answered question to time')
    await setSavedVisitTime({ sessionId, questionId, timeSpentMs: 600_000 })

    await page.reload()

    const clock = page.locator('span.tabular-nums:visible', { hasText: /^\d\d:\d\d$/ })
    await expect(clock).toHaveText(/^10:\d\d$/, { timeout: 10_000 })
  })

  test('an ended session URL opens its results page', async ({ page }) => {
    await startStudyQuiz(page)
    const sessionId = sessionIdFromUrl(page.url())
    await answerCurrent(page)
    await page.getByRole('button', { name: 'Finish Test' }).click()
    await page.getByRole('button', { name: 'Submit Quiz' }).click()
    await page.getByRole('button', { name: 'Submit anyway' }).click()
    await page.waitForURL('**/app/quiz/report**', { timeout: 20_000 })
    expect((await readSessionRow(sessionId)).endedAt).not.toBeNull()

    await page.goto(`/app/quiz/session/${sessionId}`)

    await expect(page).toHaveURL(new RegExp(`/app/quiz/report\\?session=${sessionId}$`))
    await expect(page.getByRole('heading', { name: 'Quiz Results' })).toBeVisible()
  })

  test('a discarded or unknown session id returns to the quiz page', async ({ page }) => {
    await startStudyQuiz(page)
    const sessionId = sessionIdFromUrl(page.url())
    await page.goto('/app/quiz')
    await page.getByRole('button', { name: 'Discard', exact: true }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Discard', exact: true })
      .click()
    await expect.poll(async () => (await readSessionRow(sessionId)).deletedAt).not.toBeNull()

    await page.goto(`/app/quiz/session/${sessionId}`)
    await expect(page).toHaveURL(/\/app\/quiz$/)

    await page.goto('/app/quiz/session/6c1f1a9e-77a1-4f0e-8d57-0d1d5f0a9b11')
    await expect(page).toHaveURL(/\/app\/quiz$/)
    await page.goto('/app/quiz/session/not-a-session-id')
    await expect(page).toHaveURL(/\/app\/quiz$/)
  })

  test("another student's session URL returns to the quiz page and holds none of the owner's quiz", async ({
    page,
    browser,
  }) => {
    await startStudyQuiz(page)
    const sessionUrl = page.url()
    const sessionId = sessionIdFromUrl(sessionUrl)
    const chosen = await answerCurrent(page)
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)
    const subject = await readSessionSubjectName(sessionId)
    const [firstQuestionId] = await readSessionQuestionIds(sessionId)
    if (!firstQuestionId) throw new Error('session has no questions')

    // Non-vacuous: the owner sees the quiz, the answer and the subject.
    await page.goto(sessionUrl)
    await expect(page.getByText(/Question 1 of/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId(chosen)).toHaveClass(RESULT_CLASS, { timeout: 10_000 })
    await page.goto('/app/quiz')
    const banner = page.getByText(`session for ${subject}`)
    await expect(banner).toBeVisible()
    const ownerRaw = await page.context().request.get(sessionUrl)
    expect(await ownerRaw.text()).toContain(firstQuestionId)

    const stranger = await openStrangerContext(browser)
    const raw = await stranger.context().request.get(sessionUrl)
    expect(await raw.text()).not.toContain(firstQuestionId)
    await stranger.goto(sessionUrl)

    await expect(stranger).toHaveURL(/\/app\/quiz$/)
    await expect(stranger.getByRole('heading', { name: 'Quiz' })).toBeVisible()
    await expect(stranger.getByText(`session for ${subject}`)).toHaveCount(0)
    await expect(stranger.getByText(/Unfinished/)).toHaveCount(0)
    await expect(stranger.getByText(/Question \d+ of/)).toHaveCount(0)
    await expect(stranger.locator(OPTION)).toHaveCount(0)
  })

  test('save for later keeps the session id: the Saved tab lists it and Resume continues on the same id', async ({
    page,
  }) => {
    const total = await startStudyQuiz(page)
    const sessionUrl = page.url()
    const sessionId = sessionIdFromUrl(sessionUrl)
    const chosen = await answerCurrent(page)
    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible()
    await expect.poll(async () => (await readSessionRow(sessionId)).currentIndex).toBe(1)

    await saveForLater(page)
    expect((await readSessionRow(sessionId)).savedAt).not.toBeNull()
    await expect(page.getByText(/Unfinished/)).toHaveCount(0)
    await page.getByTestId('tab-saved').click()
    await expect(page.getByText(`1 of ${total} answered`)).toBeVisible()
    await page.getByTestId('resume-saved-session').click()

    await page.waitForURL(sessionUrl, { timeout: 15_000 })
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: '‹ Previous' }).click()
    await expect(page.getByTestId(chosen)).toHaveClass(RESULT_CLASS, { timeout: 10_000 })
    expect((await readSessionRow(sessionId)).savedAt).toBeNull()
  })

  test('a blocked start offers to save the open quiz, then starts the new one while the old one waits in the Saved tab', async ({
    page,
  }) => {
    await startStudyQuiz(page)
    const oldId = sessionIdFromUrl(page.url())
    await answerCurrent(page)
    const subject = await readSessionSubjectName(oldId)

    await pressStartQuiz(page)
    await expect(page.getByText(`Your ${subject} quiz is still open.`)).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: BLOCKED_OFFER }).click()

    await page.waitForURL(SESSION_ID_URL, { timeout: 15_000 })
    expect(sessionIdFromUrl(page.url())).not.toBe(oldId)
    expect((await readSessionRow(oldId)).savedAt).not.toBeNull()
    await openSavedTab(page)
    await expect(page.getByTestId('resume-saved-session')).toHaveCount(1)
  })

  test('a blocked start takes over a quiz open in another browser context and saves it', async ({
    page,
    browser,
  }) => {
    await startStudyQuiz(page)
    const oldId = sessionIdFromUrl(page.url())
    await answerCurrent(page)
    const subject = await readSessionSubjectName(oldId)

    const other = await openClearedContext(browser)
    await pressStartQuiz(other)
    await expect(other.getByText(`Your ${subject} quiz is still open.`)).toBeVisible({
      timeout: 10_000,
    })
    await other.getByRole('button', { name: BLOCKED_OFFER }).click()

    await other.waitForURL(SESSION_ID_URL, { timeout: 15_000 })
    expect(sessionIdFromUrl(other.url())).not.toBe(oldId)
    expect((await readSessionRow(oldId)).savedAt).not.toBeNull()
    await openSavedTab(other)
    await expect(other.getByTestId('resume-saved-session')).toHaveCount(1)
  })

  test('a local-only answer from the legacy browser copy is uploaded once and the local copy removed', async ({
    page,
  }) => {
    await startStudyQuiz(page)
    const sessionUrl = page.url()
    const sessionId = sessionIdFromUrl(sessionUrl)
    const [firstQuestionId] = await readSessionQuestionIds(sessionId)
    if (!firstQuestionId) throw new Error('session has no questions')
    const userId = await readUserId(TEST_EMAIL)
    const key = `quiz-active-session:${userId}`
    expect(await readAnsweredQuestionIds(sessionId)).toEqual([])
    await page.evaluate(
      ({ key: storageKey, userId: uid, sessionId: sid, questionIds }) => {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            userId: uid,
            sessionId: sid,
            questionIds,
            answers: {
              [questionIds[0] as string]: { selectedOptionId: 'a', responseTimeMs: 1500 },
            },
            currentIndex: 0,
            savedAt: Date.now(),
            mode: 'study',
          }),
        )
      },
      { key, userId, sessionId, questionIds: await readSessionQuestionIds(sessionId) },
    )

    await page.goto(sessionUrl)

    await expect(page.getByText(/Question 1 of/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('option-a')).toHaveClass(RESULT_CLASS, { timeout: 10_000 })
    await expect
      .poll(() => readAnsweredQuestionIds(sessionId), { timeout: 10_000 })
      .toEqual([firstQuestionId])
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).toBeNull()
  })

  test('the old id-less session URL with no Discovery handoff returns to the quiz page', async ({
    page,
  }) => {
    await page.goto('/app/quiz/session')

    await expect(page).toHaveURL(/\/app\/quiz$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
  })

  test('Discovery still starts on the id-less session URL and shows questions', async ({
    page,
  }) => {
    await page.goto('/app/quiz')
    await expect(page.getByRole('button', { name: 'Discovery', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.locator('[data-testid="subject-trigger"]').click()
    await page.locator('[data-testid="subject-option"]').first().click()
    await page.getByRole('button', { name: 'Start discovery' }).click()

    await page.waitForURL(/\/app\/quiz\/session$/, { timeout: 15_000 })
    await expect(page.getByText(/Question 1 of/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Exit' })).toBeVisible()
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test('finishing after a resume in a second browser context submits every answer and the report shows them', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000)
    const total = await startStudyQuiz(page, 10)
    const sessionUrl = page.url()
    for (let i = 0; i < 3; i++) {
      await answerCurrent(page)
      await page.getByRole('button', { name: 'Next ›' }).click()
    }
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(3)
    await expect
      .poll(async () => (await readSessionRow(sessionIdFromUrl(sessionUrl))).currentIndex)
      .toBe(3)

    const other = await openClearedContext(browser)
    await other.goto(sessionUrl)
    await expect(other.getByText(`Question 4 of ${total}`)).toBeVisible({ timeout: 10_000 })
    for (let i = 3; i < total; i++) {
      await answerCurrent(other)
      if (i < total - 1) await other.getByRole('button', { name: 'Next ›' }).click()
    }
    await other.getByRole('button', { name: 'Finish Test' }).click()
    await expect(other.getByRole('dialog', { name: 'Finish quiz' })).toBeVisible()
    await other.getByRole('button', { name: 'Submit Quiz' }).click()

    await other.waitForURL('**/app/quiz/report**', { timeout: 30_000 })
    await expect(other.getByRole('heading', { name: 'Quiz Results' })).toBeVisible()
    await expect(other.getByText(`${total} questions`, { exact: true })).toBeVisible()
    await expect(other.getByRole('button', { name: 'Show explanation' })).toHaveCount(total)
  })
})
