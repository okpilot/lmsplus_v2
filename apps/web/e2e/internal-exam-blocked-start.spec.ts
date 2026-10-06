/**
 * E2E — an internal-exam code start blocked by an open practice quiz offers to save that quiz
 * first, then opens the exam.
 *
 * Auth: admin storage state issues the code; the student runs in a separate context
 * (internal-exam-student.json), as in internal-exam-resume.spec.ts.
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { signInAsAdmin } from './helpers/admin-supabase'
import { startStudyQuiz } from './helpers/quiz-session'
import {
  readSessionRow,
  readSessionSubjectName,
  resetStudentQuizSessions,
  SESSION_ID_URL,
  sessionIdFromUrl,
} from './helpers/quiz-session-id'
import {
  cleanupInternalExamStudentActiveSessions,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/admin.json' })

const SUBJECT_LABEL_FRAGMENT = 'Meteorology'

async function issueCodeAsAdmin(adminPage: Page): Promise<string> {
  await adminPage.goto('/app/admin/internal-exams')
  await expect(adminPage.getByRole('heading', { name: 'Internal Exams' })).toBeVisible()
  const form = adminPage.getByTestId('issue-code-form')
  await form.locator('[aria-label="Student"]').click()
  await adminPage
    .locator('[data-slot="select-item"]')
    .filter({ hasText: INTERNAL_EXAM_STUDENT_EMAIL })
    .first()
    .click()
  await form.locator('[aria-label="Subject"]').click()
  await adminPage
    .locator('[data-slot="select-item"]')
    .filter({ hasText: SUBJECT_LABEL_FRAGMENT })
    .first()
    .click()
  await form.getByRole('button', { name: 'Issue code' }).click()
  await expect(adminPage.getByText('Internal exam code issued')).toBeVisible({ timeout: 10_000 })
  const code = (await adminPage.getByTestId('issued-code-value').textContent())?.trim()
  if (!code) throw new Error('issued code panel had no value')
  return code
}

/** Voids the exam code first (needs the open session intact), then clears every quiz row. */
async function resetAll(): Promise<void> {
  const errors: string[] = []
  try {
    await cleanupInternalExamStudentActiveSessions(await signInAsAdmin())
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  try {
    await resetStudentQuizSessions(INTERNAL_EXAM_STUDENT_EMAIL)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  if (errors.length > 0) throw new Error(`reset: ${errors.join('; ')}`)
}

test.describe('internal exam start blocked by an open quiz', () => {
  test.setTimeout(120_000)

  test.beforeEach(async () => {
    await resetAll()
  })

  test.afterEach(async () => {
    await resetAll()
  })

  test('saves the open quiz for later and opens the internal exam', async ({
    page: adminPage,
    browser,
  }) => {
    const code = await issueCodeAsAdmin(adminPage)
    const context: BrowserContext = await browser.newContext({
      storageState: 'e2e/.auth/internal-exam-student.json',
      viewport: { width: 1280, height: 900 },
    })
    try {
      const page = await context.newPage()
      await startStudyQuiz(page)
      const oldId = sessionIdFromUrl(page.url())
      const subject = await readSessionSubjectName(oldId)

      await page.goto('/app/internal-exam')
      await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
      await page.getByTestId('start-button').first().click()
      await expect(page.getByTestId('code-entry-form')).toBeVisible()
      await page.getByTestId('code-input').fill(code)
      await page.getByRole('button', { name: 'Start exam' }).click()

      await expect(page.getByText(`Your ${subject} quiz is still open.`)).toBeVisible({
        timeout: 10_000,
      })
      await page.getByRole('button', { name: 'Save quiz for later and start exam' }).click()

      await page.waitForURL(SESSION_ID_URL, { timeout: 15_000 })
      expect(sessionIdFromUrl(page.url())).not.toBe(oldId)
      expect((await readSessionRow(oldId)).savedAt).not.toBeNull()
    } finally {
      await context.close()
    }
  })
})
