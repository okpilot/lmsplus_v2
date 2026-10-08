/**
 * E2E — a resumed Practice Exam (mock_exam) reopens by its session URL with its answers shown
 * as answered and no correctness, and the reload sends no answer check (#1026 PR 3).
 *
 * Seed dependency: the MET exam config of apps/web/scripts/seed-e2e.ts (60 s limit), so the
 * test stays well inside the time limit.
 */

import { expect, type Page, test } from '@playwright/test'
import { acceptBeforeUnload } from './helpers/before-unload'
import { isServerActionPost, readServerAnsweredCount } from './helpers/quiz-session'
import { resetStudentQuizSessions, SESSION_ID_URL } from './helpers/quiz-session-id'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 900 } })

// The runner arms a native leave prompt; an unhandled one cancels reload() and goto().
test.beforeEach(({ page }) => {
  acceptBeforeUnload(page)
})

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

async function confirmCurrent(page: Page): Promise<string> {
  const first = page.locator(OPTION).first()
  await first.waitFor({ state: 'visible' })
  const testId = await first.getAttribute('data-testid')
  if (!testId) throw new Error('first option has no test id')
  await first.click()
  await page.getByRole('button', { name: 'Confirm Answer' }).click()
  await expect(first).toBeDisabled()
  return testId
}

test.describe('Practice Exam resumed by session URL', () => {
  test.setTimeout(60_000)

  test.beforeEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test.afterEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test('a resumed mock exam shows its answers as answered with no feedback and sends no answer check', async ({
    page,
  }) => {
    await startMetExam(page)
    const sessionUrl = page.url()
    const first = await confirmCurrent(page)
    await page.getByRole('button', { name: 'Next ›' }).click()
    const second = await confirmCurrent(page)
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(2)
    const bodies: string[] = []
    page.on('request', (request) => {
      if (isServerActionPost(request)) bodies.push(request.postData() ?? '')
    })

    await page.reload()

    await expect(page).toHaveURL(sessionUrl)
    await expect(page.getByText(/Question \d+ of/)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: '‹ Previous' }).click()
    for (const id of [first, second]) {
      await expect(page.getByTestId(id)).toBeDisabled({ timeout: 10_000 })
      await expect(page.getByTestId(id)).toHaveClass(/border-muted-foreground\/40/)
      if (id === first) await page.getByRole('button', { name: 'Next ›' }).click()
    }
    await expect(page.locator(`${OPTION}[class*="border-green-500"]`)).toHaveCount(0)
    await expect(page.locator(`${OPTION}[class*="border-destructive"]`)).toHaveCount(0)
    await expect.poll(() => bodies.length, { timeout: 10_000 }).toBeGreaterThan(0)
    expect(bodies.filter((body) => body.includes('selectedOptionId'))).toEqual([])
  })
})
