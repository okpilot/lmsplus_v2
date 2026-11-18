import { expect, test } from '@playwright/test'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { makeSittingE2eMaterials } from './helpers/exam-sitting-markers'

test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 1280, height: 800 } })

const LIST = '/app/admin/internal-exams'
const SITTING_URL = /\/app\/admin\/internal-exams\/sittings\/[0-9a-f-]{36}$/

test.afterEach(async () => {
  await cleanupE2eExamSittings()
})

/** UTC input value `daysAhead` days from today at the given UTC time. */
function utcInput(daysAhead: number, hhmm: string): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return `${d.toISOString().slice(0, 10)}T${hhmm}`
}

test.beforeEach((_fixtures, testInfo) => {
  const now = new Date()
  testInfo.skip(now.getUTCHours() === 23 && now.getUTCMinutes() >= 55, 'UTC day rollover window')
})

async function createSitting(
  page: import('@playwright/test').Page,
  opts: { daysAhead: number; time: string; materials: string },
) {
  await page.goto(`${LIST}?tab=sittings`)
  await page.getByRole('link', { name: /New sitting/ }).click()
  await expect(page).toHaveURL(/tab=sittings&dlg=new|dlg=new&tab=sittings/)
  await page.getByLabel('Date and time (UTC)').fill(utcInput(opts.daysAhead, opts.time))
  await page.getByRole('combobox', { name: 'Mode' }).click()
  await page.getByRole('option', { name: 'Remote' }).click()
  await page.getByRole('combobox', { name: 'Invigilator' }).click()
  await page.getByRole('option').first().click()
  await page.getByLabel(/Permitted materials/).fill(opts.materials)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(SITTING_URL)
}

test('admin creates a sitting, refuses a past date, and lands on its page', async ({ page }) => {
  await page.goto(`${LIST}?tab=sittings`)
  await page.getByRole('link', { name: /New sitting/ }).click()
  await expect(page).toHaveURL(/dlg=new/)
  await page.getByLabel('Date and time (UTC)').fill(utcInput(-2, '09:00'))
  await page.getByRole('combobox', { name: 'Mode' }).click()
  await page.getByRole('option', { name: 'Remote' }).click()
  await page.getByRole('combobox', { name: 'Invigilator' }).click()
  await page.getByRole('option').first().click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('The sitting date must be today or later (UTC).')).toBeVisible()
  await page.keyboard.press('Escape')

  await createSitting(page, { daysAhead: 3, time: '09:30', materials: makeSittingE2eMaterials() })
  const title = await page.getByRole('heading', { level: 1 }).textContent()
  expect(title).toMatch(/UTC$/)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
})

test('admin edits mode and materials and the change persists', async ({ page }) => {
  await createSitting(page, { daysAhead: 3, time: '09:30', materials: makeSittingE2eMaterials() })
  const edited = makeSittingE2eMaterials()
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit details' }).click()
  await page.getByRole('combobox', { name: 'Mode' }).click()
  await page.getByRole('option', { name: 'In person' }).click()
  await page.getByLabel(/Permitted materials/).fill(edited)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Details saved.')).toBeVisible()
  await page.reload()
  await expect(page).not.toHaveURL(/dlg=/)
  await expect(page.getByText(new RegExp(`In person.*Materials: ${edited}`))).toBeVisible()
})

test('a scheduled sitting appears under Upcoming and opens by row click and Enter', async ({
  page,
}) => {
  await createSitting(page, { daysAhead: 3, time: '09:30', materials: makeSittingE2eMaterials() })
  await page.goto(`${LIST}?tab=sittings`)
  const row = page.getByRole('row').filter({ hasText: 'Scheduled' }).first()
  await expect(row).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Upcoming')
  await row.click()
  await expect(page).toHaveURL(SITTING_URL)

  await page.goBack()
  await page.getByRole('row').filter({ hasText: 'Scheduled' }).first().focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(SITTING_URL)
})

test('admin starts and closes a sitting dated today', async ({ page }) => {
  await createSitting(page, { daysAhead: 0, time: '23:58', materials: makeSittingE2eMaterials() })
  await page.getByRole('button', { name: 'Start sitting' }).click()
  await expect(page.getByText('Start sitting?')).toBeVisible()
  await page.getByRole('button', { name: 'Start sitting' }).last().click()
  await expect(page.getByText(/^Open · /)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/^Open · /)).toBeVisible()

  await page.goto(`${LIST}?tab=sittings&scope=open`)
  await expect(page.getByRole('row').filter({ hasText: 'Open' }).first()).toBeVisible()
  await page.getByRole('row').filter({ hasText: 'Open' }).first().click()
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit details' }).click()
  await expect(page.getByLabel('Date and time (UTC)')).toBeDisabled()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Close sitting' }).click()
  await expect(page.getByText('A closed sitting cannot be reopened.')).toBeVisible()
  await page.getByRole('button', { name: 'Close sitting' }).last().click()
  await expect(page.getByText(/^Closed · /)).toBeVisible()
  await expect(page.getByText('Closed.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(/^Closed · /)).toBeVisible()

  await page.goto(`${LIST}?tab=sittings&scope=past`)
  await expect(page.getByRole('row').filter({ hasText: 'Closed' }).first()).toBeVisible()
})

test('admin cancels a sitting and finds it under Cancelled', async ({ page }) => {
  await createSitting(page, { daysAhead: 4, time: '10:00', materials: makeSittingE2eMaterials() })
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Cancel sitting' }).click()
  await expect(page.getByRole('button', { name: 'Keep sitting' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel sitting' }).click()
  await expect(page.getByText(/^Cancelled · /)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/^Cancelled · /)).toBeVisible()
  await page.goto(`${LIST}?tab=sittings&scope=cancelled`)
  await expect(page.getByRole('row').filter({ hasText: 'Cancelled' }).first()).toBeVisible()
})

test('Start is disabled for a future sitting and says when it can start', async ({ page }) => {
  await createSitting(page, { daysAhead: 5, time: '09:30', materials: makeSittingE2eMaterials() })
  await expect(page.getByRole('button', { name: 'Start sitting' })).toBeDisabled()
  await expect(page.getByText(/^Can start on .* \(UTC\)\.$/)).toBeVisible()
})

test.describe('student access', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('a student is redirected away from the admin Internal Exams page', async ({ page }) => {
    await page.goto(`${LIST}?tab=sittings`)
    await expect(page).not.toHaveURL(/\/app\/admin\/internal-exams/)
  })
})
