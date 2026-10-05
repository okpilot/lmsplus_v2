import { expect, test } from '@playwright/test'
import { readServerAnsweredCount, startStudyQuiz, submitFirstOption } from './helpers/quiz-session'
import { cleanupStudentActiveSessions, getAdminClient, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

async function readActiveSessionId(): Promise<string> {
  const admin = getAdminClient()
  const { data: student, error: studentError } = await admin
    .from('users')
    .select('id')
    .eq('email', TEST_EMAIL)
    .maybeSingle()
  if (studentError) throw new Error(`readActiveSessionId student: ${studentError.message}`)
  if (!student) throw new Error(`readActiveSessionId: no user ${TEST_EMAIL}`)
  const { data: session, error } = await admin
    .from('quiz_sessions')
    .select('id')
    .eq('student_id', student.id)
    .is('ended_at', null)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`readActiveSessionId session: ${error.message}`)
  if (!session) throw new Error('readActiveSessionId: no active session')
  return session.id
}

test.describe('Quiz session opened by id', () => {
  test.afterEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test('resumes an open quiz with its answer at /app/quiz/session/<id>, survives reload, and leaves for the quiz page once discarded', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const total = await startStudyQuiz(page)
    await submitFirstOption(page)
    await expect(page.getByRole('button', { name: 'Submit Answer' })).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect.poll(readServerAnsweredCount, { timeout: 15_000 }).toBe(1)

    const sessionId = await readActiveSessionId()
    const sessionUrl = `/app/quiz/session/${sessionId}`

    await page.goto(sessionUrl)
    await expect(page).toHaveURL(new RegExp(`/app/quiz/session/${sessionId}$`))
    await expect(page.getByText(new RegExp(`Question \\d+ of ${total}`))).toBeVisible({
      timeout: 15_000,
    })

    await page.reload()
    await expect(page).toHaveURL(new RegExp(`/app/quiz/session/${sessionId}$`))
    await expect(page.getByText(new RegExp(`Question \\d+ of ${total}`))).toBeVisible({
      timeout: 15_000,
    })
    expect(await readServerAnsweredCount()).toBe(1)

    await cleanupStudentActiveSessions(TEST_EMAIL)
    await page.goto(sessionUrl)
    await expect(page).toHaveURL(/\/app\/quiz$/)
    await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
  })

  test('sends an unknown session id back to the quiz page', async ({ page }) => {
    await page.goto('/app/quiz/session/00000000-0000-4000-8000-000000000000')
    await expect(page).toHaveURL(/\/app\/quiz$/)
  })
})
