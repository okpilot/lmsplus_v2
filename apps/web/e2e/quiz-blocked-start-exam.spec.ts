/**
 * E2E — a Practice Exam start blocked by an open practice quiz offers to save that quiz first.
 *
 * Seed dependency: the MET exam config from apps/web/scripts/seed-e2e.ts (see exam-flow.spec.ts).
 * Auth: the shared student (user.json).
 */

import { expect, test } from '@playwright/test'
import { startStudyQuiz } from './helpers/quiz-session'
import {
  readSessionRow,
  readSessionSubjectName,
  resetStudentQuizSessions,
  SESSION_ID_URL,
  sessionIdFromUrl,
} from './helpers/quiz-session-id'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 900 } })

const BLOCKED_OFFER = 'Save quiz for later and start exam'

test.describe('Practice Exam start blocked by an open quiz', () => {
  test.setTimeout(90_000)

  test.beforeEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await resetStudentQuizSessions(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('saves the open quiz for later and opens the new Practice Exam', async ({ page }) => {
    await startStudyQuiz(page)
    const oldId = sessionIdFromUrl(page.url())
    const subject = await readSessionSubjectName(oldId)

    await page.goto('/app/quiz')
    const examMode = page.getByRole('button', { name: 'Practice Exam', exact: true })
    await expect(examMode).toBeEnabled({ timeout: 10_000 })
    await examMode.click()
    await expect(examMode).toHaveAttribute('aria-pressed', 'true')
    await page.locator('[data-testid="subject-trigger"]').click()
    await page.locator('[data-testid="subject-option"]').filter({ hasText: '050' }).first().click()
    await page.getByRole('button', { name: 'Start Practice Exam' }).click()

    await expect(page.getByText(`Your ${subject} quiz is still open.`)).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: BLOCKED_OFFER }).click()

    await page.waitForURL(SESSION_ID_URL, { timeout: 15_000 })
    expect(sessionIdFromUrl(page.url())).not.toBe(oldId)
    expect((await readSessionRow(oldId)).savedAt).not.toBeNull()
  })
})
