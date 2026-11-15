import { expect, test } from '@playwright/test'
import { cleanupE2eStudentGroups, makeStudentGroupE2eName } from './helpers/student-group-cleanup'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/admin.json' })

test.afterEach(async () => {
  await cleanupE2eStudentGroups()
})

test('admin creates, populates, filters, renames and deletes a group', async ({ page }) => {
  const name = makeStudentGroupE2eName()
  const renamed = `${name}-r`

  // Entry: create
  await page.goto('/app/admin/students?tab=groups')
  await expect(page.getByRole('tab', { name: 'Groups' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'New Group' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create Group' }).click()
  const row = page.getByRole('row').filter({ hasText: name })
  await expect(row).toBeVisible()
  await expect(row.getByRole('cell').nth(2)).toHaveText('0')

  // Reload mid-flow: group persists
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible()

  // Bulk add a student from the students page
  await page.goto(`/app/admin/students?search=${encodeURIComponent(TEST_EMAIL)}`)
  const studentRow = page.getByRole('row').filter({ hasText: TEST_EMAIL })
  await studentRow.getByRole('checkbox').check()
  await page.getByRole('combobox', { name: 'Target group' }).click()
  await page.getByRole('option', { name }).click()
  await page.getByRole('button', { name: 'Add to group' }).click()
  await expect(page.getByText(`Added 1 student to ${name}`)).toBeVisible()

  // Member count and group filter link
  await page.goto('/app/admin/students?tab=groups')
  await expect(page.getByRole('row').filter({ hasText: name }).getByRole('cell').nth(2)).toHaveText(
    '1',
  )
  await page
    .getByRole('row')
    .filter({ hasText: name })
    .getByRole('link', { name: 'View students' })
    .click()
  await expect(page).toHaveURL(/\/app\/admin\/students\?group=[0-9a-f-]{36}/)
  await expect(page.getByRole('row').filter({ hasText: TEST_EMAIL })).toBeVisible()

  // Reload keeps the filter
  await page.reload()
  await expect(page).toHaveURL(/group=/)
  await expect(page.getByRole('row').filter({ hasText: TEST_EMAIL })).toBeVisible()

  // Rename
  await page.goto('/app/admin/students?tab=groups')
  await page.getByRole('button', { name: `Edit ${name}` }).click()
  await page.getByLabel('Name').fill(renamed)
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByRole('row').filter({ hasText: renamed })).toBeVisible()

  // Delete: post-exit state
  await page.getByRole('button', { name: `Delete ${renamed}` }).click()
  await page.getByRole('button', { name: 'Delete group' }).click()
  await expect(page.getByText('Group deleted')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: renamed })).toHaveCount(0)
  await page.reload()
  await expect(page).toHaveURL(/\/app\/admin\/students\/groups$/)
  await expect(page.getByRole('row').filter({ hasText: renamed })).toHaveCount(0)
})

test('admin removes a student from a group via the bulk bar', async ({ page }) => {
  const name = makeStudentGroupE2eName()
  await page.goto('/app/admin/students?tab=groups')
  await page.getByRole('button', { name: 'New Group' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create Group' }).click()
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible()

  const select = async () => {
    await page.goto(`/app/admin/students?search=${encodeURIComponent(TEST_EMAIL)}`)
    await page.getByRole('row').filter({ hasText: TEST_EMAIL }).getByRole('checkbox').check()
    await page.getByRole('combobox', { name: 'Target group' }).click()
    await page.getByRole('option', { name }).click()
  }

  await select()
  await page.getByRole('button', { name: 'Add to group' }).click()
  await expect(page.getByText(`Added 1 student to ${name}`)).toBeVisible()

  // Reload mid-flow, then remove
  await page.reload()
  await select()
  await page.getByRole('button', { name: 'Remove from group' }).click()
  await expect(page.getByText(/Removed 1 student/)).toBeVisible()

  await page.goto('/app/admin/students?tab=groups')
  await expect(page.getByRole('row').filter({ hasText: name }).getByRole('cell').nth(2)).toHaveText(
    '0',
  )
})

test('cleanup helper is a no-op when no marked groups exist', async () => {
  await cleanupE2eStudentGroups()
  await cleanupE2eStudentGroups()
})

test('admin switches between Students and Groups tabs', async ({ page }) => {
  await page.goto('/app/admin/students')
  await page.getByRole('tab', { name: 'Groups' }).click()
  await expect(page).toHaveURL(/tab=groups/)
  await expect(page.getByRole('button', { name: 'New Group' })).toBeVisible()
  await page.getByRole('tab', { name: 'Students' }).click()
  await expect(page).not.toHaveURL(/tab=/)
})
