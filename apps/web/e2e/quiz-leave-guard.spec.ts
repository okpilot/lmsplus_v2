/**
 * E2E — Back/Forward/refresh never leaves a live quiz runner silently (#1489, closes #1012).
 *
 * Study and Practice Exam open the Finish dialog on Back; Discovery opens a Stay/Leave confirm.
 * The native beforeunload prompt covers refresh. Seed dependency: the MET exam config of
 * apps/web/scripts/seed-e2e.ts (60 s limit; every exam step here stays well inside it).
 */

import { expect, type Page, test } from '@playwright/test'
import { acceptBeforeUnload } from './helpers/before-unload'
import { startStudyQuiz, submitFirstOption } from './helpers/quiz-session'
import { resetStudentQuizSessions, SESSION_ID_URL } from './helpers/quiz-session-id'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 900 } })

const OPTION = '[data-testid^="option-"]'

async function startMetExam(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  const examMode = page.getByRole('button', { name: 'Practice Exam', exact: true })
  await expect(examMode).toBeEnabled({ timeout: 10_000 })
  await examMode.click()
  await page.locator('[data-testid="subject-trigger"]').click()
  await page.locator('[data-testid="subject-option"]').filter({ hasText: '050' }).first().click()
  await page.getByRole('button', { name: 'Start Practice Exam' }).click()
  await page.waitForURL(SESSION_ID_URL, { timeout: 15_000 })
  await expect(page.getByText(/Question 1 of/)).toBeVisible({ timeout: 10_000 })
}

async function startDiscovery(page: Page): Promise<void> {
  await page.goto('/app/quiz')
  await expect(page.getByRole('button', { name: 'Discovery', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.locator('[data-testid="subject-trigger"]').click()
  await page.locator('[data-testid="subject-option"]').first().click()
  await page.getByRole('button', { name: 'Start discovery' }).click()
  await page.waitForURL(/\/app\/quiz\/session$/, { timeout: 15_000 })
  await expect(page.getByText(/Question 1 of/)).toBeVisible({ timeout: 10_000 })
}

test.describe('Quiz leave guard', () => {
  test.setTimeout(60_000)

  test.beforeEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test.afterEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test('Back in a study quiz opens the Finish dialog and Return keeps the runner', async ({
    page,
  }) => {
    const total = await startStudyQuiz(page)
    const sessionUrl = page.url()

    await page.goBack()

    await expect(page.getByRole('dialog', { name: 'Finish Quiz' })).toBeVisible()
    await expect(page).toHaveURL(sessionUrl)
    await page.getByRole('button', { name: 'Return to Quiz' }).click()
    await expect(page.getByText(`Question 1 of ${total}`)).toBeVisible()
    await expect(page).toHaveURL(sessionUrl)
  })

  test('Back after picking an option without submitting warns the pick is unsubmitted', async ({
    page,
  }) => {
    await startStudyQuiz(page)
    const options = page.locator('button:has(span.rounded-full)')
    await options.first().waitFor({ state: 'visible' })
    await options.first().click()

    await page.goBack()

    await expect(page.getByRole('dialog', { name: 'Finish Quiz' })).toBeVisible()
    await expect(
      page.getByText("You picked an answer on this question but haven't submitted it."),
    ).toBeVisible()
  })

  test('Back in a study quiz still opens the Finish dialog after an answer was submitted', async ({
    page,
  }) => {
    await startStudyQuiz(page)
    await submitFirstOption(page)
    await expect(page.getByRole('button', { name: 'Submit Answer' })).toHaveCount(0, {
      timeout: 10_000,
    })

    await page.goBack()

    await expect(page.getByRole('dialog', { name: 'Finish Quiz' })).toBeVisible()
    await expect(
      page.getByText("You picked an answer on this question but haven't submitted it."),
    ).toHaveCount(0)
  })

  test('Back in a practice exam opens the exam Finish dialog and Submit lands on the report', async ({
    page,
  }) => {
    await startMetExam(page)
    const first = page.locator(OPTION).first()
    await first.waitFor({ state: 'visible' })
    await first.click()
    await page.getByRole('button', { name: 'Confirm Answer' }).click()
    await expect(first).toBeDisabled()

    await page.goBack()

    const dialog = page.getByRole('dialog', { name: 'Finish Practice Exam' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Submit/ }).click()
    const anyway = dialog.getByRole('button', { name: 'Submit anyway' })
    if (await anyway.isVisible({ timeout: 2_000 }).catch(() => false)) await anyway.click()
    await page.waitForURL(/\/app\/quiz\/report\?session=/, { timeout: 30_000 })
  })

  test('Back in discovery asks Stay or Leave; Stay keeps the runner and Leave returns to the quiz page', async ({
    page,
  }) => {
    await startDiscovery(page)

    await page.goBack()

    const dialog = page.getByRole('alertdialog', { name: 'Leave discovery?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Stay' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText(/Question 1 of/)).toBeVisible()
    await expect(page).toHaveURL(/\/app\/quiz\/session$/)

    await page.goBack()
    await page
      .getByRole('alertdialog', { name: 'Leave discovery?' })
      .getByRole('button', { name: 'Leave' })
      .click()
    await expect(page).toHaveURL(/\/app\/quiz$/, { timeout: 15_000 })
  })

  test('the discovery Exit button asks the same Stay or Leave question', async ({ page }) => {
    await startDiscovery(page)

    await page.getByRole('button', { name: 'Exit' }).click()

    const dialog = page.getByRole('alertdialog', { name: 'Leave discovery?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Leave' }).click()
    await expect(page).toHaveURL(/\/app\/quiz$/, { timeout: 15_000 })
  })

  test('after leaving discovery, Back from the quiz page does not reopen the runner', async ({
    page,
  }) => {
    await startDiscovery(page)
    await page.getByRole('button', { name: 'Exit' }).click()
    await page.getByRole('button', { name: 'Leave' }).click()
    await expect(page).toHaveURL(/\/app\/quiz$/, { timeout: 15_000 })

    await page.goBack()

    await expect(page.getByText(/Question 1 of/)).toHaveCount(0)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  })

  test('refreshing a study quiz with nothing answered raises the browser leave prompt', async ({
    page,
  }) => {
    const total = await startStudyQuiz(page)
    const prompts = acceptBeforeUnload(page)
    await page.getByText(`Question 1 of ${total}`).click()

    await page.reload()

    expect(prompts()).toBe(1)
    await expect(page.getByText(`Question 1 of ${total}`)).toBeVisible({ timeout: 10_000 })
  })
})
