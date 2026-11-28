import { expect, type Page, test } from '@playwright/test'
import { getAdminOrganizationId } from './helpers/admin-supabase'
import { cleanupCreatedExamConfigs, ensureExamConfigs } from './helpers/exam-config-cleanup'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { seedSitting } from './helpers/exam-sitting-seed'
import { skipNearUtcRollover } from './helpers/utc-rollover'

test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 1280, height: 800 } })

const BASE = '/app/admin/internal-exams/sittings'

test.beforeEach(async () => {
  skipNearUtcRollover()
  await ensureExamConfigs(await getAdminOrganizationId())
})

test.afterEach(async () => {
  const errors: string[] = []
  for (const step of [cleanupE2eExamSittings, cleanupCreatedExamConfigs]) {
    try {
      await step()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
})

function personRow(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

const THREE = [
  { name: 'E2E Ann Needs', entries: [{ state: 'no_code' as const }] },
  { name: 'E2E Bea Ready', entries: [{ state: 'live' as const }] },
  { name: 'E2E Cy Attempt', entries: [{ state: 'finished_passed' as const }] },
]

test('roster lists each candidate with status text and expands to exam lines', async ({ page }) => {
  const { sittingId } = await seedSitting({ status: 'open', people: THREE })
  await page.goto(`${BASE}/${sittingId}`)
  await expect(personRow(page, 'E2E Ann Needs')).toBeVisible()
  await expect(personRow(page, 'E2E Bea Ready')).toBeVisible()
  await expect(personRow(page, 'E2E Cy Attempt')).toContainText('Done')
  await page.getByRole('button', { name: 'Show exams for E2E Bea Ready' }).click()
  await expect(page.getByRole('button', { name: 'Hide exams for E2E Bea Ready' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(page.getByRole('button', { name: /^Copy code for / })).toBeVisible()
  await page.reload()
  await expect(personRow(page, 'E2E Bea Ready')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show exams for E2E Bea Ready' })).toBeVisible()
})

test('search and Show filter live in the URL, survive reload and pagination', async ({ page }) => {
  const { sittingId } = await seedSitting({
    status: 'open',
    people: THREE,
    extraPeople: 60,
  })
  await page.goto(`${BASE}/${sittingId}`)
  await page.getByLabel('Search people in this sitting').fill('Bea')
  await expect(page).toHaveURL(/q=Bea/)
  await page.reload()
  await expect(page.getByLabel('Search people in this sitting')).toHaveValue('Bea')
  await expect(personRow(page, 'E2E Bea Ready')).toBeVisible()
  await expect(personRow(page, 'E2E Ann Needs')).toHaveCount(0)

  await page.getByLabel('Search people in this sitting').fill('')
  await page.getByRole('combobox', { name: 'Show' }).click()
  await page.getByRole('option', { name: 'Has attempts' }).click()
  await expect(page).toHaveURL(/show=attempts/)
  await expect(personRow(page, 'E2E Cy Attempt')).toBeVisible()
  await expect(personRow(page, 'E2E Bea Ready')).toHaveCount(0)

  await page.getByRole('combobox', { name: 'Show' }).click()
  await page.getByRole('option', { name: 'All people' }).click()
  await expect(page).not.toHaveURL(/show=/)
  await page.getByRole('button', { name: '2', exact: true }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByText(/Showing 51–/)).toBeVisible()
})

test('Remove exam updates the row and persists; an exam with an attempt has no Remove exam', async ({
  page,
}) => {
  const { sittingId } = await seedSitting({ status: 'open', people: THREE })
  await page.goto(`${BASE}/${sittingId}`)
  await page.getByRole('button', { name: 'Show exams for E2E Cy Attempt' }).click()
  await page.getByRole('button', { name: /^Actions for .*, E2E Cy Attempt$/ }).click()
  await expect(page.getByRole('menuitem', { name: 'View attempt' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Remove exam' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()

  await page.getByRole('button', { name: 'Show exams for E2E Ann Needs' }).click()
  await page.getByRole('button', { name: /^Actions for .*, E2E Ann Needs$/ }).click()
  await page.getByRole('menuitem', { name: 'Remove exam' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove exam' }).click()
  await expect(personRow(page, 'E2E Ann Needs')).toContainText('No exams')
  await page.reload()
  await expect(personRow(page, 'E2E Ann Needs')).toContainText('No exams')
})

test('Void code with a reason shows Voided, then Issue new code makes it live again', async ({
  page,
}) => {
  const { sittingId } = await seedSitting({ status: 'open', people: THREE })
  await page.goto(`${BASE}/${sittingId}`)
  await page.getByRole('button', { name: 'Show exams for E2E Bea Ready' }).click()
  await page.getByRole('button', { name: /^Actions for .*, E2E Bea Ready$/ }).click()
  await page.getByRole('menuitem', { name: 'Void code' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Wrong person')
  await page.getByRole('dialog').getByRole('button', { name: 'Void code', exact: true }).click()
  await expect(page.getByText('Voided', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: /^Actions for .*, E2E Bea Ready$/ }).click()
  await page.getByRole('menuitem', { name: 'Issue new code' }).click()
  await expect(page.getByText('Voided', { exact: true })).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Show exams for E2E Bea Ready' }).click()
  await expect(page.getByRole('button', { name: /^Copy code for / })).toBeVisible()
})

test('Remove person from the row menu and in bulk; a person with an attempt cannot be selected or removed (⋯ offers Add exams only)', async ({
  page,
}) => {
  const { sittingId } = await seedSitting({ status: 'open', people: THREE })
  await page.goto(`${BASE}/${sittingId}`)
  await page.getByRole('button', { name: 'Actions for E2E Ann Needs' }).click()
  await page.getByRole('menuitem', { name: 'Remove from sitting' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
  await expect(personRow(page, 'E2E Ann Needs')).toHaveCount(0)

  await page.getByRole('checkbox', { name: 'Select E2E Bea Ready' }).check()
  await page.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
  await expect(personRow(page, 'E2E Bea Ready')).toHaveCount(0)

  await expect(page.getByRole('checkbox', { name: 'Select E2E Cy Attempt' })).toBeDisabled()
  await page.getByRole('button', { name: 'Actions for E2E Cy Attempt' }).click()
  await expect(page.getByRole('menuitem', { name: 'Add exams' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Remove from sitting' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(personRow(page, 'E2E Cy Attempt')).toBeVisible()
})

test('Print codes lists live codes only; a closed sitting print page shows not-found', async ({
  page,
}) => {
  const { sittingId } = await seedSitting({
    status: 'scheduled',
    people: [
      { name: 'E2E Dee Live', entries: [{ state: 'live' as const }] },
      { name: 'E2E Eve Expired', entries: [{ state: 'expired' as const }] },
    ],
  })
  await page.goto(`${BASE}/${sittingId}`)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Print codes' }).click()
  await expect(page).toHaveURL(new RegExp(`${sittingId}/print$`))
  await expect(page.getByText('E2E Dee Live')).toBeVisible()
  await expect(page.getByText('E2E Eve Expired')).toHaveCount(0)
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
  await expect(page.getByText('E2E Dee Live')).toBeVisible()
  await page.emulateMedia({ media: 'screen' })

  const closed = await seedSitting({ status: 'closed', people: THREE })
  await page.goto(`${BASE}/${closed.sittingId}/print`)
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await expect(page.getByText('E2E Dee Live')).toHaveCount(0)
})

test('removed list and pending-notices banner appear for an auto-removed entry', async ({
  page,
}) => {
  const { sittingId } = await seedSitting({
    status: 'open',
    people: THREE,
    autoRemoved: [{ name: 'E2E Fay Passed' }],
  })
  await page.goto(`${BASE}/${sittingId}`)
  await expect(page.getByText('1 notice waiting to be sent.')).toBeVisible()
  await expect(page.getByText(/E2E Fay Passed · .+ · passed /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send notices' })).toBeVisible()
})

test('removed list reads "no notice (deactivated)" for a deactivated auto-removed student, survives reload, no banner', async ({
  page,
}) => {
  const { sittingId } = await seedSitting({
    status: 'open',
    people: THREE,
    autoRemoved: [{ name: 'E2E Gus Gone', deactivated: true }],
  })
  await page.goto(`${BASE}/${sittingId}`)
  await expect(page).toHaveURL(`${BASE}/${sittingId}`)
  await expect(
    page.getByText(/E2E Gus Gone · .+ · passed .+ · no notice \(deactivated\)/),
  ).toBeVisible()
  await expect(page.getByText(/notice waiting to be sent/)).toHaveCount(0)
  await page.reload()
  await expect(page).toHaveURL(`${BASE}/${sittingId}`)
  await expect(page.getByText(/E2E Gus Gone · .+ no notice \(deactivated\)/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send notices' })).toHaveCount(0)
})

test.describe('student session', () => {
  test.use({ storageState: 'e2e/.auth/internal-exam-student.json' })

  test('cannot open the sitting page or the print page', async ({ page }) => {
    const { sittingId } = await seedSitting({ status: 'scheduled', people: THREE })
    for (const path of [`${BASE}/${sittingId}`, `${BASE}/${sittingId}/print`]) {
      await page.goto(path)
      // require-admin sends a signed-in non-admin to the student dashboard; assert the
      // destination, not just that we left the sitting.
      await expect(page).toHaveURL(/\/app\/dashboard(\?|$)/)
      await expect(page.locator('body')).not.toContainText(/Exam codes/)
    }
  })
})
