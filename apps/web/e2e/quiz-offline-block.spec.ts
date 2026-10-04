import { expect, type Page, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

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

async function readServerAnsweredCount(): Promise<number> {
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

test.describe('Quiz blocks while an answer is unsent and resends on reconnect', () => {
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test.afterEach(async ({ page, context }) => {
    await context.setOffline(false)
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('quiz-active-session:')) localStorage.removeItem(key)
      }
    })
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test('an answer submitted offline blocks the quiz, then is sent and saved once the connection returns', async ({
    page,
    context,
  }) => {
    const total = await startStudyQuiz(page)
    const options = page.locator('button:has(span.rounded-full)')
    await options.first().waitFor({ state: 'visible' })
    expect(await readServerAnsweredCount()).toBe(0)

    // Entry: connection drops, the student submits an answer.
    await context.setOffline(true)
    await options.first().click()
    await page.getByRole('button', { name: 'Submit Answer' }).first().click()

    // In progress: a non-dismissable overlay blocks the quiz and nothing reached the server.
    const overlay = page.getByRole('alertdialog')
    await expect(overlay).toBeVisible({ timeout: 10_000 })
    await expect(overlay.getByText('Connection lost — reconnecting…')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(overlay).toBeVisible()
    expect(await readServerAnsweredCount()).toBe(0)

    // Exit: the connection returns, the overlay clears and the answer lands server-side.
    await context.setOffline(false)
    await expect(overlay).toBeHidden({ timeout: 20_000 })
    await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Submit Answer' })).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)

    // Post-exit + reload mid-flow: the saved answer survives and the quiz resumes.
    await page.reload()
    await expect(page).toHaveURL(/\/app\/quiz\/session$/)
    await expect(page.getByRole('heading', { name: 'Resume your quiz?' })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByText(`Question 1 of ${total}`)).toBeVisible({ timeout: 10_000 })
    expect(await readServerAnsweredCount()).toBe(1)
  })
})
