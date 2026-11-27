/**
 * E2E spec: sitting notices (change, cancel, auto-removal + banner Send), #1777 PR 2c-ii.
 * Local (no RESEND_API_KEY, dev fallback): sends succeed. CI (production start, no key):
 * sends fail, so the failed path is asserted instead, as in the 2c-i code-email specs.
 */
import { expect, test } from '@playwright/test'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { seedSitting } from './helpers/exam-sitting-seed'
import { getAdminClient } from './helpers/supabase'
import { skipNearUtcRollover } from './helpers/utc-rollover'

test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 1280, height: 800 } })

const BASE = '/app/admin/internal-exams/sittings'
const SENDS = !process.env.CI

test.beforeEach(() => {
  skipNearUtcRollover()
})

test.afterEach(async () => {
  await cleanupE2eExamSittings()
})

/** Marks every code of the sitting as already emailed. */
async function markCodesEmailed(sittingId: string) {
  const admin = getAdminClient()
  const entries = await admin.from('exam_sitting_entries').select('id').eq('sitting_id', sittingId)
  if (entries.error) throw new Error(`entries: ${entries.error.message}`)
  const { error } = await admin
    .from('internal_exam_codes')
    .update({ emailed_at: new Date().toISOString() })
    .in(
      'sitting_entry_id',
      (entries.data ?? []).map((e) => e.id),
    )
  if (error) throw new Error(`emailed_at: ${error.message}`)
}

test('rescheduling a sitting with an emailed code reports the change notice', async ({ page }) => {
  const { sittingId } = await seedSitting({
    status: 'scheduled',
    people: [{ name: 'E2E Ann Notice', entries: [{ state: 'live' as const }] }],
  })
  await markCodesEmailed(sittingId)
  await page.goto(`${BASE}/${sittingId}`)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit details' }).click()
  const date = new Date(Date.now() + 5 * 86_400_000)
  date.setUTCHours(11, 0, 0, 0)
  await page.getByLabel('Date and time (UTC)').fill(date.toISOString().slice(0, 16))
  await page.getByRole('button', { name: 'Save' }).click()
  if (SENDS) await expect(page.getByText('Change notice sent to 1 student')).toBeVisible()
  else await expect(page.getByText(/Change notice failed for E2E Ann Notice/)).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(`${BASE}/${sittingId}`)
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`${day}, 11:00`)
})

test('cancelling a sitting with an emailed code reports the cancellation notice', async ({
  page,
}) => {
  const { sittingId } = await seedSitting({
    status: 'scheduled',
    people: [{ name: 'E2E Bea Notice', entries: [{ state: 'live' as const }] }],
  })
  await markCodesEmailed(sittingId)
  await page.goto(`${BASE}/${sittingId}`)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Cancel sitting' }).click()
  await expect(
    page.getByText('Students who were emailed a code get a cancellation notice.'),
  ).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel sitting' }).click()
  if (SENDS) await expect(page.getByText(/1 notice sent/)).toBeVisible()
  else await expect(page.getByText(/Notice failed for E2E Bea Notice/)).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(`${BASE}/${sittingId}`)
  await expect(page.getByText('Cancelled', { exact: false }).first()).toBeVisible()
})

test('Send notices delivers the auto-removal notice and clears the banner', async ({ page }) => {
  const { sittingId } = await seedSitting({
    status: 'open',
    people: [{ name: 'E2E Cy Other', entries: [{ state: 'live' as const }] }],
    autoRemoved: [{ name: 'E2E Fay Passed' }],
  })
  await page.goto(`${BASE}/${sittingId}`)
  await expect(page.getByText('1 notice waiting to be sent.')).toBeVisible()
  await page.getByRole('button', { name: 'Send notices' }).click()
  if (SENDS) {
    await expect(page.getByText('1 notice waiting to be sent.')).toHaveCount(0)
    await expect(page.getByText(/E2E Fay Passed · .+ · notice sent/)).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Send notices' })).toHaveCount(0)
  } else {
    await expect(page.getByText(/Failed 1/)).toBeVisible()
    await expect(page.getByText('1 notice waiting to be sent.')).toBeVisible()
  }
})
