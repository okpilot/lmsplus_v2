/**
 * E2E — a finished VFR RT Practice session opens its report on the VFR RT route from /app/reports.
 *
 * Seeds an RT pool into the e2e org for the shared e2e student; afterEach discards any open
 * session; afterAll soft-deletes the pool. Signs in per test: settings.spec.ts resets this
 * student's password.
 */

import { expect, test } from '@playwright/test'
import { SESSION_ID_URL } from './helpers/quiz-session-id'
import {
  cleanupStudentActiveSessions,
  getAdminClient,
  TEST_EMAIL,
  TEST_PASSWORD,
} from './helpers/supabase'
import { getEgmontOrgId } from './redteam/helpers/seed-core'
import { cleanupVfrRtPool, seedVfrRtPool, type VfrRtPool } from './redteam/helpers/seed-vfr-rt-pool'

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 1000 } })

test.describe('VFR RT practice report routing', () => {
  test.setTimeout(120_000)

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
    await cleanupStudentActiveSessions(TEST_EMAIL)
    await page.goto('/')
    await page.getByLabel('Email address').fill(TEST_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  })

  test.afterEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test.afterAll(async () => {
    await cleanupVfrRtPool({ admin: getAdminClient(), orgId, pool })
  })

  test('opens the VFR RT report from the reports list and keeps it after a reload', async ({
    page,
  }) => {
    await page.goto('/app/vfr-rt')
    await page.getByRole('button', { name: 'Start Practice' }).click()
    await page.waitForURL(SESSION_ID_URL, { timeout: 20_000 })
    await expect(page.getByText(/Question \d/).first()).toBeVisible({ timeout: 15_000 })

    // Question order is shuffled; step forward to a short-answer question and answer it.
    const input = page.locator('[data-testid="short-answer-input"]')
    for (let i = 0; i < 10 && (await input.count()) === 0; i++) {
      await page.getByRole('button', { name: 'Next ›' }).click()
    }
    await input.fill('alpha')
    await page.getByRole('button', { name: 'Submit Answer' }).click()
    await expect(input).toBeDisabled()

    await page.getByRole('button', { name: 'Finish Test' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(Submit|Finish)/ })
      .click()
    const anyway = page.getByRole('button', { name: 'Submit anyway' })
    if (await anyway.isVisible({ timeout: 2_000 }).catch(() => false)) await anyway.click()
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
