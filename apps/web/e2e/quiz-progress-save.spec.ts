import { expect, type Page, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

type ProgressSnapshot = { currentIndex: number; answeredCount: number }

async function startStudyQuiz(page: Page): Promise<number> {
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Study', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const trigger = page.locator('[data-testid="subject-trigger"]')
  await trigger.waitFor({ state: 'visible' })
  await trigger.click()
  await page.locator('[data-testid="subject-option"]').first().click()
  await page.getByRole('button', { name: 'All' }).click()
  const text = await page.getByText(/of \d+ selected/).textContent()
  const total = Number(text?.match(/of (\d+) selected/)?.[1] ?? 0)
  expect(total).toBeGreaterThanOrEqual(3)
  await page.getByRole('button', { name: 'Start Quiz' }).click()
  await page.waitForURL('**/app/quiz/session', { timeout: 10_000 })
  await expect(page.getByText(`Question 1 of ${total}`)).toBeVisible({ timeout: 10_000 })
  return total
}

// Submit stays visible while the check is in flight; it unmounts once feedback is recorded.
async function waitForFeedback(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Submit Answer' })).toHaveCount(0, {
    timeout: 10_000,
  })
}

async function savedLocalAnswerCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('quiz-active-session:'))
    if (!key) return -1
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null || !('answers' in parsed)) return -1
    const answers = (parsed as { answers: unknown }).answers
    return typeof answers === 'object' && answers !== null ? Object.keys(answers).length : -1
  })
}

async function readServerProgress(): Promise<ProgressSnapshot | null> {
  const admin = getAdminClient()
  const { data: student, error: studentError } = await admin
    .from('users')
    .select('id')
    .eq('email', TEST_EMAIL)
    .maybeSingle()
  if (studentError) throw new Error(`readServerProgress student: ${studentError.message}`)
  if (!student) throw new Error(`readServerProgress: no user ${TEST_EMAIL}`)
  const { data: session, error: sessionError } = await admin
    .from('quiz_sessions')
    .select('id, current_index')
    .eq('student_id', student.id)
    .is('ended_at', null)
    .is('deleted_at', null)
    .maybeSingle()
  if (sessionError) throw new Error(`readServerProgress session: ${sessionError.message}`)
  if (!session) return null
  const { data: rows, error: rowsError } = await admin
    .from('quiz_session_progress')
    .select('question_id')
    .eq('session_id', session.id)
    .not('answer', 'is', null)
  if (rowsError) throw new Error(`readServerProgress rows: ${rowsError.message}`)
  return { currentIndex: session.current_index, answeredCount: rows?.length ?? 0 }
}

test.describe('Quiz progress saved to the server', () => {
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('quiz-active-session:')) localStorage.removeItem(key)
      }
    })
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test('answer and position are persisted server-side and survive a page reload', async ({
    page,
  }) => {
    const total = await startStudyQuiz(page)

    // Entry: nothing answered yet, position 0.
    const answerBtns = page.locator('button:has(span.rounded-full)')
    await answerBtns.first().waitFor({ state: 'visible' })
    await answerBtns.first().click()
    await page.getByRole('button', { name: 'Submit Answer' }).first().click()
    await waitForFeedback(page)
    const next = page.getByRole('button', { name: 'Next ›' })

    // In progress: the answer reaches quiz_session_progress without any explicit save.
    await expect
      .poll(async () => (await readServerProgress())?.answeredCount, { timeout: 10_000 })
      .toBe(1)

    await next.click()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible()
    await expect
      .poll(async () => (await readServerProgress())?.currentIndex, { timeout: 10_000 })
      .toBe(1)

    // Reload mid-flow: server progress is intact and Resume returns to the saved question.
    await page.reload()
    await expect(page).toHaveURL(/\/app\/quiz\/session$/)
    await expect(page.getByRole('heading', { name: 'Resume your quiz?' })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible({ timeout: 10_000 })
    expect(await readServerProgress()).toEqual({ currentIndex: 1, answeredCount: 1 })
  })

  test('a second tab taking over the session shows the taken-over message on the first tab', async ({
    page,
    context,
  }) => {
    const total = await startStudyQuiz(page)
    const firstAnswers = page.locator('button:has(span.rounded-full)')
    await firstAnswers.first().waitFor({ state: 'visible' })
    await firstAnswers.first().click()
    await page.getByRole('button', { name: 'Submit Answer' }).first().click()
    await waitForFeedback(page)
    const next = page.getByRole('button', { name: 'Next ›' })
    await next.click()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible()

    // Second tab = new page load = new in-memory device id; loading the session claims it.
    const second = await context.newPage()
    await second.goto('/app/quiz')
    await expect(second).toHaveURL(/\/app\/quiz$/)
    const resume = second.getByRole('button', { name: 'Resume' }).first()
    await resume.waitFor({ state: 'visible', timeout: 10_000 })
    await resume.click()
    await second.waitForURL('**/app/quiz/session', { timeout: 10_000 })
    await expect(second.getByText(new RegExp(`Question \\d+ of ${total}`))).toBeVisible({
      timeout: 10_000,
    })

    // First tab keeps answering: the stale device is told to reload.
    await firstAnswers.first().click()
    await page.getByRole('button', { name: 'Submit Answer' }).first().click()
    await expect(page.getByText(/open in another tab or device/i)).toBeVisible({
      timeout: 10_000,
    })
    // The rejected answer is not left in the local copy a later resume reads.
    expect(await savedLocalAnswerCount(page)).toBe(1)
    await second.close()
  })
})
