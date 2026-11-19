/**
 * E2E — an internal-exam code start blocked by an open practice quiz offers to save that quiz
 * first, then opens the exam.
 *
 * Auth: admin storage state issues the code; the student runs in a separate context
 * (internal-exam-student.json), as in internal-exam-resume.spec.ts.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
import { signInAsAdmin } from './helpers/admin-supabase'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { startStudyQuiz } from './helpers/quiz-session'
import {
  readSessionRow,
  readSessionSubjectName,
  resetStudentQuizSessions,
  SESSION_ID_URL,
  sessionIdFromUrl,
} from './helpers/quiz-session-id'
import { issueSittingCodeFor } from './helpers/sitting-code'
import {
  cleanupInternalExamStudentActiveSessions,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/admin.json' })

const SUBJECT_LABEL_FRAGMENT = 'Meteorology'

/** Service-role seed: an open sitting holding the student with a live code (no UI, no RPC). */
async function issueCode(): Promise<string> {
  const { code } = await issueSittingCodeFor({
    studentEmail: INTERNAL_EXAM_STUDENT_EMAIL,
    subjectFragment: SUBJECT_LABEL_FRAGMENT,
  })
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
  try {
    await cleanupE2eExamSittings()
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

  test('saves the open quiz for later and opens the internal exam', async ({ browser }) => {
    const code = await issueCode()
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
