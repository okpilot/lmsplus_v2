/**
 * E2E spec — admin session report (`/app/admin/dashboard/sessions/[id]`).
 *
 * The finished session is produced by the dedicated internal-exam student in a second browser
 * context (the default page stays on admin storage), as internal-exam-lifecycle.spec.ts does.
 * `afterEach` soft-deletes the sessions this file tracks; `beforeEach` clears any a failed start left.
 */

import { type Browser, expect, type Page, test } from '@playwright/test'
import { signInAsAdmin } from './helpers/admin-supabase'
import { startStudyQuiz, submitFirstOption } from './helpers/quiz-session'
import {
  readAnsweredQuestionIds,
  readSessionRow,
  sessionIdFromUrl,
} from './helpers/quiz-session-id'
import {
  cleanupInternalExamStudentActiveSessions,
  getAdminClient,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/admin.json' })

const UNKNOWN_SESSION_ID = '00000000-0000-4000-8000-00000000e2e3'
const createdSessionIds = new Set<string>()

async function withStudentPage<T>(browser: Browser, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ storageState: 'e2e/.auth/internal-exam-student.json' })
  try {
    return await run(await context.newPage())
  } finally {
    await context.close()
  }
}

/** Starts a study quiz as the student and answers one question; the session stays active. */
async function startActiveSession(page: Page): Promise<string> {
  await startStudyQuiz(page, 10)
  const sessionId = sessionIdFromUrl(page.url())
  createdSessionIds.add(sessionId)
  await submitFirstOption(page)
  await expect.poll(() => readAnsweredQuestionIds(sessionId), { timeout: 15_000 }).toHaveLength(1)
  return sessionId
}

/** Submits the active quiz and waits for the student's own report; returns the session id. */
async function finishSession(page: Page): Promise<string> {
  const sessionId = await startActiveSession(page)
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await page.getByRole('button', { name: 'Submit Quiz' }).click()
  await page.getByRole('button', { name: 'Submit anyway' }).click()
  await page.waitForURL(`**/app/quiz/report?session=${sessionId}`, { timeout: 30_000 })
  return sessionId
}

async function readStudent(): Promise<{ id: string; fullName: string }> {
  const { data, error } = await getAdminClient()
    .from('users')
    .select('id, full_name')
    .eq('email', INTERNAL_EXAM_STUDENT_EMAIL)
    .single()
  if (error) throw new Error(`readStudent: ${error.message}`)
  if (!data.full_name) throw new Error('readStudent: seeded student has no full_name')
  return { id: data.id, fullName: data.full_name }
}

async function softDeleteCreatedSessions(): Promise<void> {
  const ids = [...createdSessionIds]
  createdSessionIds.clear()
  if (ids.length === 0) return
  const { data, error } = await getAdminClient()
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`softDeleteCreatedSessions: ${error.message}`)
  if ((data?.length ?? 0) > 0) {
    console.log(`[softDeleteCreatedSessions] soft-deleted ${data?.length} session(s)`)
  }
}

test.describe('admin session report', () => {
  test.setTimeout(90_000)

  test.beforeEach(async () => {
    await cleanupInternalExamStudentActiveSessions(await signInAsAdmin())
  })

  test.afterEach(async () => {
    await softDeleteCreatedSessions()
  })

  test('opens a finished student session from Recent Activity and keeps it after a reload', async ({
    page,
    browser,
  }) => {
    const student = await readStudent()
    const sessionId = await withStudentPage(browser, finishSession)

    await page.goto('/app/admin/dashboard')
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible()
    await page.locator(`a[href="/app/admin/dashboard/sessions/${sessionId}"]`).click()

    await expect(page).toHaveURL(new RegExp(`/app/admin/dashboard/sessions/${sessionId}$`))
    await expect(page.getByRole('heading', { name: 'Quiz Results' })).toBeVisible()
    await expect(page.getByText('Session Report')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Question Breakdown' })).toBeVisible()
    await expect(page.getByText('1 question', { exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: /^(Correct|Incorrect)$/ })).toHaveCount(1)
    await expect(page.getByText('Not answered')).toHaveCount(0)
    await expect(page.getByRole('link', { name: student.fullName, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to Student' })).toHaveAttribute(
      'href',
      `/app/admin/dashboard/students/${student.id}`,
    )

    await page.reload()

    await expect(page).toHaveURL(new RegExp(`/app/admin/dashboard/sessions/${sessionId}$`))
    await expect(page.getByRole('heading', { name: 'Quiz Results' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Question Breakdown' })).toBeVisible()
  })

  test('sends an unknown session id back to the admin dashboard', async ({ page }) => {
    await page.goto(`/app/admin/dashboard/sessions/${UNKNOWN_SESSION_ID}`)

    await expect(page).toHaveURL(/\/app\/admin\/dashboard$/)
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Quiz Results' })).toHaveCount(0)
  })

  test('shows not found for a session id that is not a uuid', async ({ page }) => {
    await page.goto('/app/admin/dashboard/sessions/not-a-uuid')

    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to admin dashboard' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Quiz Results' })).toHaveCount(0)
  })

  test('sends a session that is still in progress back to the admin dashboard', async ({
    page,
    browser,
  }) => {
    const sessionId = await withStudentPage(browser, startActiveSession)
    // The session exists and is unfinished, so the redirect below is the loader's refusal.
    expect(await readSessionRow(sessionId)).toMatchObject({ endedAt: null })

    await page.goto(`/app/admin/dashboard/sessions/${sessionId}`)

    await expect(page).toHaveURL(/\/app\/admin\/dashboard$/)
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Quiz Results' })).toHaveCount(0)
  })
})
