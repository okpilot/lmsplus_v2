/**
 * E2E — quiz setup counts refresh on return (#1605): a tab return and a Back navigation re-read
 * the counts; the selected filter survives the refresh.
 *
 * Auth: the shared student (user.json). Hermetic via resetStudentQuizSessions.
 */

import { expect, type Page, test } from '@playwright/test'
import { seedStudentFlag, softDeleteStudentFlags } from './helpers/flags'
import { submitFirstOption } from './helpers/quiz-session'
import { resetStudentQuizSessions, SESSION_ID_URL } from './helpers/quiz-session-id'
import { getAdminClient, TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 900 } })

const FLAG_BUTTON = '[data-testid="flag-button"]'

/** Picks the first subject; returns its code (the first span of the option). */
async function pickFirstSubject(page: Page): Promise<string> {
  await page.locator('[data-testid="subject-trigger"]').click()
  const option = page.locator('[data-testid="subject-option"]').first()
  const code = (await option.locator('span').first().textContent())?.trim() ?? ''
  await option.click()
  return code
}

/** Discovery (the default mode) reads the server preload; Flagged is a preloaded filter set. */
async function openDiscoveryWithFlagged(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await pickFirstSubject(page)
  await page.getByRole('switch', { name: 'Flagged questions' }).click()
}

/** An active question of the first subject, flagged for the student before the page loads. */
async function seedFirstSubjectFlag(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  const code = await pickFirstSubject(page)
  const admin = getAdminClient()
  const { data: subject, error: subjectError } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', code)
    .single()
  if (subjectError) throw new Error(`seed subject ${code}: ${subjectError.message}`)
  const { data: question, error: questionError } = await admin
    .from('questions')
    .select('id')
    .eq('subject_id', subject.id)
    .eq('status', 'active')
    .eq('question_type', 'multiple_choice')
    .is('deleted_at', null)
    .limit(1)
    .single()
  if (questionError) throw new Error(`seed question ${code}: ${questionError.message}`)
  await seedStudentFlag(TEST_EMAIL, question.id)
}

/** Study quiz over the first subject, all questions, no filters. */
async function startStudyQuiz(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Study', exact: true }).click()
  await pickFirstSubject(page)
  await page.getByRole('button', { name: 'All' }).click()
  await page.getByRole('button', { name: 'Start Quiz' }).click()
  await page.waitForURL(SESSION_ID_URL, { timeout: 10_000 })
}

/** Flags the first question not yet flagged: skips ones whose button reads Unflag. */
async function flagAnUnflaggedQuestion(page: Page): Promise<void> {
  const flag = page.locator(FLAG_BUTTON)
  await flag.waitFor({ state: 'visible' })
  for (let i = 0; i < 5; i++) {
    if ((await flag.textContent())?.includes('Unflag') !== true) break
    await page.getByRole('button', { name: /Next/ }).first().click()
  }
  await expect(flag).toContainText('Flag')
  await flag.click()
  await expect(flag).toContainText('Unflag')
}

/** Flags a question in a Study quiz, then submits the quiz. */
async function flagAndFinishQuiz(page: Page): Promise<void> {
  await startStudyQuiz(page)
  await flagAnUnflaggedQuestion(page)
  await submitFirstOption(page)
  await page.getByRole('button', { name: 'Finish Test' }).click()
  await expect(page.getByRole('dialog', { name: 'Finish Quiz' })).toBeVisible()
  await page.getByRole('button', { name: 'Submit Quiz' }).click()
  await page.getByRole('button', { name: 'Submit anyway' }).click()
  await page.waitForURL('**/app/quiz/report**', { timeout: 15_000 })
}

async function selectedCount(page: Page): Promise<number> {
  const text = await page.getByText(/of \d+ selected/).textContent()
  return Number(text?.match(/of (\d+) selected/)?.[1] ?? Number.NaN)
}

test.describe('Quiz setup counts refresh', () => {
  test.setTimeout(90_000)

  test.beforeEach(async ({ page }) => {
    await resetStudentQuizSessions(TEST_EMAIL)
    await softDeleteStudentFlags(TEST_EMAIL)
    await seedFirstSubjectFlag(page)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await resetStudentQuizSessions(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await softDeleteStudentFlags(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('count changes after flagging in another tab and returning, filters kept', async ({
    page,
    context,
  }) => {
    await openDiscoveryWithFlagged(page)
    const before = await selectedCount(page)
    expect(before).toBe(1)

    const other = await context.newPage()
    await startStudyQuiz(other)
    await flagAnUnflaggedQuestion(other)
    await page.bringToFront()
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

    await expect.poll(() => selectedCount(page), { timeout: 15_000 }).toBe(before + 1)
    await expect(page.getByRole('switch', { name: 'Flagged questions' })).toBeChecked()
  })

  test('count reflects a flag made in a finished quiz after Back', async ({ page }) => {
    await openDiscoveryWithFlagged(page)
    const before = await selectedCount(page)
    expect(before).toBe(1)

    await flagAndFinishQuiz(page)

    // The report replaces the session entry: one Back lands on the setup page.
    await page.goBack()
    await expect(page).toHaveURL(/\/app\/quiz$/)

    // The restored page remounts: pick the same subject and filter on the restored payload.
    await pickFirstSubject(page)
    await page.getByRole('switch', { name: 'Flagged questions' }).click()
    await expect.poll(() => selectedCount(page), { timeout: 15_000 }).toBe(before + 1)
  })
})
