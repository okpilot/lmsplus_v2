import { expect, type Page, test } from '@playwright/test'
import { getAdminClient, TEST_EMAIL } from './helpers/supabase'

// Read-only spec: creates and mutates no rows, so no cleanup is required.
test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 800 } })

async function readDisplayName(): Promise<string> {
  const { data, error } = await getAdminClient()
    .from('users')
    .select('full_name, email')
    .eq('email', TEST_EMAIL)
    .is('deleted_at', null)
    .single()
  if (error || !data) throw new Error(`readDisplayName: ${error?.message ?? 'no user'}`)
  return data.full_name ?? data.email
}

async function expectStudentShell(page: Page, displayName: string) {
  const firstName = displayName.split(' ')[0]
  await expect(page.getByText(`Welcome back, ${firstName}`)).toBeVisible()
  await expect(page.getByText(displayName, { exact: true })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(nav.getByRole('link', { name: 'Quiz' })).toBeVisible()
  await expect(nav.getByText('Admin', { exact: true })).toHaveCount(0)
}

test.describe('App shell user identity', () => {
  test('shows the student name in dashboard and sidebar, no Admin group, and keeps them after reload', async ({
    page,
  }) => {
    const displayName = await readDisplayName()

    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expectStudentShell(page, displayName)

    await page.reload()
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expectStudentShell(page, displayName)

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/settings$/)
    await expect(page.getByText(displayName, { exact: true }).first()).toBeVisible()
  })

  test('student cannot reach admin pages from the shell', async ({ page }) => {
    await page.goto('/app/admin/students')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })
})
