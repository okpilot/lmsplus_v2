/**
 * E2E — a finished VFR RT Practice session opens its report on the VFR RT route from /app/reports.
 *
 * Seeds an RT pool into the e2e org for the shared e2e student; afterEach discards any open
 * session and soft-deletes the sessions the test started; afterAll soft-deletes the pool. Signs in per test: settings.spec.ts resets this
 * student's password.
 */

import { expect, test } from '@playwright/test'
import { SESSION_ID_URL, sessionIdFromUrl } from './helpers/quiz-session-id'
import {
  cleanupStudentActiveSessions,
  getAdminClient,
  TEST_EMAIL,
  TEST_PASSWORD,
} from './helpers/supabase'
import { getEgmontOrgId } from './redteam/helpers/seed-core'
import {
  cleanupVfrRtPool,
  seedVfrRtPool,
  VFR_RT_SA_ANSWER,
  type VfrRtPool,
} from './redteam/helpers/seed-vfr-rt-pool'

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 1000 } })

test.describe('VFR RT practice report routing', () => {
  test.setTimeout(120_000)

  let pool: VfrRtPool
  let orgId: string
  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    const admin = getAdminClient()
    orgId = await getEgmontOrgId(admin)
    const { data, error } = await admin.from('users').select('id').eq('email', TEST_EMAIL).single()
    if (error || !data) throw new Error(`beforeAll student lookup: ${error?.message}`)
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: data.id })
  })

  test.beforeEach(async ({ page }) => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
    await page.goto('/')
    await page.getByLabel('Email address').fill(TEST_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await cleanupStudentActiveSessions(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      if (createdSessionIds.size > 0) {
        const { data, error } = await getAdminClient()
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', [...createdSessionIds])
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`soft-delete created sessions: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[vfr-rt-practice-report] soft-deleted ${data?.length} session(s)`)
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      createdSessionIds.clear()
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test.afterAll(async () => {
    await cleanupVfrRtPool({ admin: getAdminClient(), orgId, pool })
  })

  test('opens the VFR RT report from the reports list and keeps it after a reload', async ({
    page,
  }) => {
    await page.goto('/app/vfr-rt')
    // Draw the whole pool so a short-answer question is always in the session.
    await expect(page.getByText(/of \d+ selected/)).toBeVisible()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await page.getByRole('button', { name: 'Start Practice' }).click()
    await page.waitForURL(SESSION_ID_URL, { timeout: 20_000 })
    createdSessionIds.add(sessionIdFromUrl(page.url()))
    await expect(page.getByText(/Question \d/).first()).toBeVisible({ timeout: 15_000 })

    // Question order is shuffled; step forward to a short-answer question and answer it.
    const input = page.locator('[data-testid="short-answer-input"]')
    for (let i = 0; i < 30 && (await input.count()) === 0; i++) {
      await page.getByRole('button', { name: 'Next ›' }).click()
      await expect(page.getByText(`Question ${i + 2} of`)).toBeVisible()
    }
    await expect(input).toHaveCount(1)
    await input.fill(VFR_RT_SA_ANSWER)
    await page.getByRole('button', { name: 'Submit Answer' }).click()
    await expect(input).toBeDisabled()

    await page.getByRole('button', { name: 'Finish Test' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(Submit|Finish)/ })
      .click()
    const anyway = page.getByRole('button', { name: 'Submit anyway' })
    if (
      await anyway.waitFor({ state: 'visible', timeout: 2_000 }).then(
        () => true,
        () => false,
      )
    )
      await anyway.click()
    await page.waitForURL(/\/app\/vfr-rt\/report\?session=/, { timeout: 30_000 })
    const reportUrl = page.url()

    await page.goto('/app/reports')
    await page.reload()
    const { pathname, search } = new URL(reportUrl)
    const row = page.getByRole('main').locator(`a[href="${pathname}${search}"]:visible`).first()
    await expect(row).toBeVisible()
    await row.click()
    await page.waitForURL(/\/app\/vfr-rt\/report\?session=/, { timeout: 15_000 })
    expect(page.url()).toBe(reportUrl)

    await page.reload()
    await expect(page).toHaveURL(reportUrl)
  })
})
