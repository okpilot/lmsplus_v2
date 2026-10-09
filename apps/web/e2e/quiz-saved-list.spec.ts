import { expect, type Page, test } from '@playwright/test'
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

async function readSavedSession(): Promise<{
  id: string
  saved_at: string | null
  deleted_at: string | null
}> {
  const admin = getAdminClient()
  const { data: student, error: studentError } = await admin
    .from('users')
    .select('id')
    .eq('email', TEST_EMAIL)
    .maybeSingle()
  if (studentError) throw new Error(`readSavedSession student: ${studentError.message}`)
  if (!student) throw new Error(`readSavedSession: no user ${TEST_EMAIL}`)
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('id, saved_at, deleted_at')
    .eq('student_id', student.id)
    .not('saved_at', 'is', null)
    .maybeSingle()
  if (error) throw new Error(`readSavedSession: ${error.message}`)
  if (!data) throw new Error('readSavedSession: no saved session')
  return data
}

async function saveCurrentQuizForLater(page: Page): Promise<number> {
  const total = await startStudyQuiz(page)
  await submitFirstOption(page)
  await expect.poll(readServerAnsweredCount, { timeout: 15_000 }).toBe(1)
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await expect(page.getByRole('dialog', { name: 'Finish quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Save for Later' }).click()
  await expect(page).toHaveURL(/\/app\/quiz$/, { timeout: 15_000 })
  return total
}

test.describe('Saved quizzes list', () => {
  test.beforeEach(async () => {
    await cleanupSavedSessions(TEST_EMAIL)
  })

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

  test('save for later lists the quiz with its progress, survives reload, and Resume reopens the same session', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const total = await saveCurrentQuizForLater(page)
    const saved = await readSavedSession()
    expect(saved.deleted_at).not.toBeNull()

    await page.getByTestId('tab-saved').click()
    await expect(page.getByTestId('resume-saved-session')).toBeVisible()
    await expect(page.getByText(`1 of ${total} answered`)).toBeVisible()

    await page.reload()
    await page.getByTestId('tab-saved').click()
    await expect(page.getByText(`1 of ${total} answered`)).toBeVisible()

    await page.getByTestId('resume-saved-session').click()
    await expect(page).toHaveURL(new RegExp(`/app/quiz/session/${saved.id}$`), {
      timeout: 15_000,
    })
    await expect(page.getByText(new RegExp(`Question \\d+ of ${total}`))).toBeVisible({
      timeout: 15_000,
    })
    const { data, error } = await getAdminClient()
      .from('quiz_sessions')
      .select('saved_at, deleted_at')
      .eq('id', saved.id)
      .single()
    if (error) throw new Error(error.message)
    expect(data.saved_at).toBeNull()
    expect(data.deleted_at).toBeNull()
  })

  test('deleting a saved quiz from its card removes it and it stays gone after reload', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await saveCurrentQuizForLater(page)
    await page.getByTestId('tab-saved').click()
    await expect(page.getByTestId('delete-saved-session')).toBeVisible()
    const saved = await readSavedSession()

    page.once('dialog', (d) => d.accept())
    await page.getByTestId('delete-saved-session').click()
    await expect(page.getByTestId('delete-saved-session')).toHaveCount(0, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/app\/quiz$/)

    await page.reload()
    await page.getByTestId('tab-saved').click()
    await expect(page.getByTestId('tab-saved')).toBeVisible()
    // The Saved tab rendered: its empty state, or a remaining draft card.
    await expect(
      page
        .getByText(/No saved quizzes/)
        .or(page.getByTestId('draft-progress'))
        .first(),
    ).toBeVisible()
    await expect(page.getByTestId('resume-saved-session')).toHaveCount(0)
    await expect(page.getByTestId('delete-saved-session')).toHaveCount(0)
    const { data, error } = await getAdminClient()
      .from('quiz_sessions')
      .select('saved_at')
      .eq('id', saved.id)
      .single()
    if (error) throw new Error(error.message)
    expect(data.saved_at).toBeNull()
  })
})
