import { expect, type Page } from '@playwright/test'
import { getAdminClient, TEST_EMAIL } from './supabase'

export async function startStudyQuiz(page: Page): Promise<number> {
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

export async function readServerAnsweredCount(): Promise<number> {
  const admin = getAdminClient()
  const { data: student, error: studentError } = await admin
    .from('users')
    .select('id')
    .eq('email', TEST_EMAIL)
    .maybeSingle()
  if (studentError) throw new Error(`readServerAnsweredCount student: ${studentError.message}`)
  if (!student) throw new Error(`readServerAnsweredCount: no user ${TEST_EMAIL}`)
  const { data: session, error: sessionError } = await admin
    .from('quiz_sessions')
    .select('id')
    .eq('student_id', student.id)
    .is('ended_at', null)
    .is('deleted_at', null)
    .maybeSingle()
  if (sessionError) throw new Error(`readServerAnsweredCount session: ${sessionError.message}`)
  if (!session) return 0
  const { data: rows, error: rowsError } = await admin
    .from('quiz_session_progress')
    .select('question_id')
    .eq('session_id', session.id)
    .not('answer', 'is', null)
  if (rowsError) throw new Error(`readServerAnsweredCount rows: ${rowsError.message}`)
  return rows?.length ?? 0
}

/** Picks the first option and submits it (the visible Submit button; mobile + desktop both exist). */
export async function submitFirstOption(page: Page): Promise<void> {
  const options = page.locator('button:has(span.rounded-full)')
  await options.first().waitFor({ state: 'visible' })
  await options.first().click()
  await page.getByRole('button', { name: 'Submit Answer' }).first().click()
}

/** A Next.js Server Action call: a POST carrying the `next-action` header. */
export function isServerActionPost(request: {
  method(): string
  headers(): Record<string, string>
}): boolean {
  return request.method() === 'POST' && 'next-action' in request.headers()
}

export async function clearQuizActiveSessionKeys(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('quiz-active-session:')) localStorage.removeItem(key)
    }
  })
}

/** Saved rows are soft-deleted already, so cleanupStudentActiveSessions cannot see them. */
export async function cleanupSavedSessions(studentEmail: string): Promise<void> {
  const admin = getAdminClient()
  const { data: student, error: studentError } = await admin
    .from('users')
    .select('id')
    .eq('email', studentEmail)
    .maybeSingle()
  if (studentError) throw new Error(`cleanupSavedSessions student: ${studentError.message}`)
  if (!student) return
  const { data, error } = await admin
    .from('quiz_sessions')
    .update({ saved_at: null })
    .eq('student_id', student.id)
    .not('saved_at', 'is', null)
    .select('id')
  if (error) throw new Error(`cleanupSavedSessions: ${error.message}`)
  if ((data?.length ?? 0) > 0) {
    console.log(`[cleanupSavedSessions] cleared ${data?.length} saved marker(s)`)
  }
}
