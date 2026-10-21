import { expect, test } from '@playwright/test'

// Read-only spec: creates and mutates no rows, so no cleanup is required.
test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 1280, height: 800 } })

test.describe('App shell admin navigation', () => {
  test('shows the Admin nav group for an admin, survives reload, and links to admin pages', async ({
    page,
  }) => {
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav.getByText('Admin', { exact: true })).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(nav.getByText('Admin', { exact: true })).toBeVisible()

    await nav.getByRole('link', { name: 'Students' }).click()
    await expect(page).toHaveURL(/\/app\/admin\/students$/, { timeout: 30000 })
    await expect(nav.getByText('Admin', { exact: true })).toBeVisible()
  })
})
