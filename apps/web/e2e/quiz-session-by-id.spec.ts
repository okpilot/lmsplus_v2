import { expect, test } from '@playwright/test'
import { acceptBeforeUnload } from './helpers/before-unload'
import {
  cleanupSavedSessions,
  readServerAnsweredCount,
  startStudyQuiz,
  submitFirstOption,
} from './helpers/quiz-session'
import { cleanupStudentActiveSessions, getAdminClient, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

// This spec registers its own dialog listener, which takes over every dialog; accept beforeunload.
test.beforeEach(({ page }) => {
  acceptBeforeUnload(page)
})

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

async function parkSessionAsSaved(sessionId: string): Promise<void> {
  const now = new Date().toISOString()
  const { data, error } = await getAdminClient()
    .from('quiz_sessions')
    .update({ saved_at: now, deleted_at: now })
    .eq('id', sessionId)
    .select('id')
  if (error) throw new Error(`parkSessionAsSaved: ${error.message}`)
  if ((data?.length ?? 0) === 0) throw new Error('parkSessionAsSaved: no row updated')
}

async function readSessionState(
  sessionId: string,
): Promise<{ deleted_at: string | null; saved_at: string | null }> {
  const { data, error } = await getAdminClient()
    .from('quiz_sessions')
    .select('deleted_at, saved_at')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`readSessionState: ${error.message}`)
  return data
}

test.describe('Quiz session opened by id', () => {
  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await cleanupStudentActiveSessions(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSavedSessions(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('shows a saved quiz on its own URL, survives reload, and resumes it into the question view', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const total = await startStudyQuiz(page)
    await submitFirstOption(page)
    await expect.poll(readServerAnsweredCount, { timeout: 15_000 }).toBe(1)
    const sessionId = await readActiveSessionId()
    await parkSessionAsSaved(sessionId)
    const sessionUrl = `/app/quiz/session/${sessionId}`

    await page.goto(sessionUrl)
    await expect(page).toHaveURL(new RegExp(`/app/quiz/session/${sessionId}$`))
    await expect(page.getByRole('heading', { name: 'Saved quiz' })).toBeVisible()
    await expect(page.getByText(`1 of ${total} answered`)).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(new RegExp(`/app/quiz/session/${sessionId}$`))
    await expect(page.getByRole('heading', { name: 'Saved quiz' })).toBeVisible()
    expect((await readSessionState(sessionId)).saved_at).not.toBeNull()

    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByText(new RegExp(`Question \\d+ of ${total}`))).toBeVisible({
      timeout: 15_000,
    })
    await expect(page).toHaveURL(new RegExp(`/app/quiz/session/${sessionId}$`))
    expect((await readSessionState(sessionId)).saved_at).toBeNull()
  })

  test('deletes a saved quiz and returns to the quiz page', async ({ page }) => {
    test.setTimeout(90_000)
    await startStudyQuiz(page)
    const sessionId = await readActiveSessionId()
    await parkSessionAsSaved(sessionId)

    await page.goto(`/app/quiz/session/${sessionId}`)
    await expect(page.getByRole('heading', { name: 'Saved quiz' })).toBeVisible()
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/app\/quiz$/, { timeout: 15_000 })

    const state = await readSessionState(sessionId)
    expect(state.deleted_at).not.toBeNull()
    expect(state.saved_at).toBeNull()
    await page.goto(`/app/quiz/session/${sessionId}`)
    await expect(page).toHaveURL(/\/app\/quiz$/)
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
    const state = await readSessionState(sessionId)
    expect(state.deleted_at).not.toBeNull()
    expect(state.saved_at).toBeNull()
    await page.goto(sessionUrl)
    await expect(page).toHaveURL(/\/app\/quiz$/)
    await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
  })

  test('sends an unknown session id back to the quiz page', async ({ page }) => {
    await page.goto('/app/quiz/session/00000000-0000-4000-8000-000000000000')
    await expect(page).toHaveURL(/\/app\/quiz$/)
  })
})
