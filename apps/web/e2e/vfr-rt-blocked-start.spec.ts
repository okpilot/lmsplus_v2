/**
 * E2E — VFR RT page with an open practice quiz: the blocked exam start offers to save the quiz,
 * and the practice banner resumes or discards it.
 *
 * Seeds an RT pool + enabled RT exam_config like vfr-rt-exam.spec.ts. Signs in per test:
 * settings.spec.ts resets this student's password, which revokes the saved session.
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
import { getAdminClient, TEST_EMAIL, TEST_PASSWORD } from './helpers/supabase'
import { getEgmontOrgId } from './redteam/helpers/seed-core'
import { cleanupVfrRtPool, seedVfrRtPool, type VfrRtPool } from './redteam/helpers/seed-vfr-rt-pool'

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 1000 } })

test.describe('VFR RT page with an open practice quiz', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  let pool: VfrRtPool
  let orgId: string

  test.beforeAll(async () => {
    const admin = getAdminClient()
    orgId = await getEgmontOrgId(admin)
    const { data, error } = await admin.from('users').select('id').eq('email', TEST_EMAIL).single()
    if (error || !data) throw new Error(`beforeAll student lookup: ${error?.message}`)
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: data.id })
  })

  test.beforeEach(async ({ page }) => {
    await resetStudentQuizSessions(TEST_EMAIL)
    await page.goto('/')
    await page.getByLabel('Email address').fill(TEST_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  })

  test.afterEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      await resetStudentQuizSessions(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupVfrRtPool({ admin: getAdminClient(), orgId, pool })
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('saves the open quiz for later and opens the VFR RT mock exam', async ({ page }) => {
    await startStudyQuiz(page)
    const oldId = sessionIdFromUrl(page.url())
    const subject = await readSessionSubjectName(oldId)

    await page.goto('/app/vfr-rt')
    const examMode = page.getByRole('button', { name: 'Practice Exam', exact: true })
    await expect(examMode).toBeEnabled({ timeout: 10_000 })
    await examMode.click()
    await expect(examMode).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Start VFR RT Mock Exam' }).click()

    await expect(page.getByText(`Your ${subject} quiz is still open.`)).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: 'Save quiz for later and start the exam' }).click()

    await page.waitForURL(SESSION_ID_URL, { timeout: 20_000 })
    expect(sessionIdFromUrl(page.url())).not.toBe(oldId)
    expect((await readSessionRow(oldId)).savedAt).not.toBeNull()
  })

  test('the practice banner resumes the open quiz on its own URL', async ({ page }) => {
    await startStudyQuiz(page)
    const oldUrl = page.url()

    await page.goto('/app/vfr-rt')
    await expect(page.getByText(/Unfinished .* session/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: 'Resume' })).toHaveAttribute(
      'href',
      new URL(oldUrl).pathname,
    )
    await page.getByRole('link', { name: 'Resume' }).click()

    await page.waitForURL(oldUrl, { timeout: 15_000 })
    await expect(page.getByText(/Question \d/).first()).toBeVisible({ timeout: 10_000 })
  })

  test('the practice banner discards the open quiz', async ({ page }) => {
    await startStudyQuiz(page)
    const oldId = sessionIdFromUrl(page.url())

    await page.goto('/app/vfr-rt')
    await expect(page.getByText(/Unfinished .* session/)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Discard' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click()

    await expect(page.getByText(/Unfinished .* session/)).toHaveCount(0, { timeout: 10_000 })
    const row = await readSessionRow(oldId)
    expect(row.endedAt ?? row.deletedAt).not.toBeNull()
  })
})
