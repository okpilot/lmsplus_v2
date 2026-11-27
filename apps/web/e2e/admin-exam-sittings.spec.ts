import { expect, test } from '@playwright/test'
import { cleanupE2eExamSittings, markE2eSitting } from './helpers/exam-sitting-cleanup'
import { skipNearUtcRollover } from './helpers/utc-rollover'

test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 1280, height: 800 } })

const LIST = '/app/admin/internal-exams'
const SITTING_URL = /\/app\/admin\/internal-exams\/sittings\/[0-9a-f-]{36}$/

test.beforeEach(() => {
  skipNearUtcRollover()
})

test.afterEach(async () => {
  await cleanupE2eExamSittings()
})

/** UTC input value `daysAhead` days from today at the given UTC time. */
function utcInput(daysAhead: number, hhmm: string): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return `${d.toISOString().slice(0, 10)}T${hhmm}`
}

async function createSitting(
  page: import('@playwright/test').Page,
  opts: { daysAhead: number; time: string },
) {
  await page.goto(`${LIST}?tab=sittings`)
  await page.getByRole('button', { name: /New sitting/ }).click()
  await expect(page).toHaveURL(/tab=sittings&dlg=new|dlg=new&tab=sittings/)
  await page.getByLabel('Date and time (UTC)').fill(utcInput(opts.daysAhead, opts.time))
  await page.getByRole('combobox', { name: 'Mode' }).click()
  await page.getByRole('option', { name: 'Remote' }).click()
  await page.getByRole('combobox', { name: 'Invigilator' }).click()
  await page
    .getByRole('option', { name: /\((admin|instructor)\)$/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(SITTING_URL, { timeout: 30_000 })
  const id = new URL(page.url()).pathname.split('/').pop() ?? ''
  // Known limit: a Save that commits while this assertion times out leaves an unmarked row.
  await markE2eSitting(id)
  return id
}

/** The list row of one sitting, keyed by the id in its date link. */
function sittingRow(page: import('@playwright/test').Page, id: string) {
  return page.getByRole('row').filter({ has: page.locator(`a[href$="/sittings/${id}"]`) })
}

/** Opens the list at `query` and pages forward (50 per page) until the sitting's row shows; older rows can push it off page 1. */
async function gotoRowPage(page: import('@playwright/test').Page, query: string, id: string) {
  for (let n = 1; n <= 20; n++) {
    await page.goto(`${LIST}?tab=sittings${query}${n > 1 ? `&page=${n}` : ''}`)
    await expect(page.getByRole('combobox', { name: 'Status' })).toBeVisible()
    if ((await sittingRow(page, id).count()) > 0) return sittingRow(page, id)
  }
  throw new Error(`sitting ${id} not found in the first 20 pages of ${query || 'upcoming'}`)
}

test('admin creates a sitting, refuses a past date, and lands on its page', async ({ page }) => {
  await page.goto(`${LIST}?tab=sittings`)
  await page.getByRole('button', { name: /New sitting/ }).click()
  await expect(page).toHaveURL(/dlg=new/)
  await page.getByLabel('Date and time (UTC)').fill(utcInput(-2, '09:00'))
  await page.getByRole('combobox', { name: 'Mode' }).click()
  await page.getByRole('option', { name: 'Remote' }).click()
  await page.getByRole('combobox', { name: 'Invigilator' }).click()
  await page
    .getByRole('option', { name: /\((admin|instructor)\)$/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('The sitting date must be today or later (UTC).')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/dlg=/)
  await expect(page).toHaveURL(/\/app\/admin\/internal-exams\?tab=sittings/)

  await createSitting(page, { daysAhead: 3, time: '09:30' })
  const title = await page.getByRole('heading', { level: 1 }).textContent()
  expect(title).toMatch(/UTC$/)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
})

test('admin edits the mode and the change persists', async ({ page }) => {
  await createSitting(page, { daysAhead: 3, time: '09:30' })
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit details' }).click()
  await page.getByRole('combobox', { name: 'Mode' }).click()
  await page.getByRole('option', { name: 'In person' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Details saved.')).toBeVisible()
  await page.reload()
  await expect(page).not.toHaveURL(/dlg=/)
  await expect(page.getByText(/In person/)).toBeVisible()
})

test('a scheduled sitting appears under Upcoming and opens by row click and Enter', async ({
  page,
}) => {
  const id = await createSitting(page, {
    daysAhead: 3,
    time: '09:30',
  })
  const row = await gotoRowPage(page, '', id)
  await expect(row).toContainText('Scheduled')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Upcoming')
  await row.click()
  await expect(page).toHaveURL(SITTING_URL)

  await page.goBack()
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(SITTING_URL)
})

test('admin starts and closes a sitting dated today', async ({ page }) => {
  const id = await createSitting(page, {
    daysAhead: 0,
    time: '23:58',
  })
  await page.getByRole('button', { name: 'Start sitting' }).click()
  await expect(page.getByText('Start sitting?')).toBeVisible()
  await page.getByRole('button', { name: 'Start sitting' }).last().click()
  await expect(page.getByText(/^Open · /)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/^Open · /)).toBeVisible()

  const openRow = await gotoRowPage(page, '&scope=open', id)
  await expect(openRow).toContainText('Open')
  await openRow.click()
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit details' }).click()
  await expect(page).toHaveURL(/dlg=edit/)
  await expect(page.getByLabel('Date and time (UTC)')).toBeDisabled()
  await page.reload()
  await expect(page.getByLabel('Date and time (UTC)')).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/dlg=/)
  await expect(page).toHaveURL(SITTING_URL)

  await page.getByRole('button', { name: 'Close sitting' }).click()
  await expect(page.getByText('A closed sitting cannot be reopened.')).toBeVisible()
  await page.getByRole('button', { name: 'Close sitting' }).last().click()
  await expect(page.getByText(/^Closed · /)).toBeVisible()
  await expect(page.getByText('Closed.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(/^Closed · /)).toBeVisible()

  await expect(await gotoRowPage(page, '&scope=past', id)).toContainText('Closed')
})

test('admin cancels a sitting and finds it under Cancelled', async ({ page }) => {
  const id = await createSitting(page, {
    daysAhead: 4,
    time: '10:00',
  })
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Cancel sitting' }).click()
  await expect(page.getByRole('button', { name: 'Keep sitting' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel sitting' }).click()
  await expect(page.getByText(/^Cancelled · /)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/^Cancelled · /)).toBeVisible()
  await expect(await gotoRowPage(page, '&scope=cancelled', id)).toContainText('Cancelled')
})

test('Start is disabled for a future sitting and says when it can start', async ({ page }) => {
  await createSitting(page, { daysAhead: 5, time: '09:30' })
  await expect(page.getByRole('button', { name: 'Start sitting' })).toBeDisabled()
  await expect(page.getByText(/^Can start on .* UTC\.$/)).toBeVisible()
})

test.describe('student access', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('a student is redirected away from the admin Internal Exams page', async ({ page }) => {
    await page.goto(`${LIST}?tab=sittings`)
    await expect(page).not.toHaveURL(/\/app\/admin\/internal-exams/)
  })
})
