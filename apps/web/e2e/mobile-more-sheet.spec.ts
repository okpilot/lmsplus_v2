import { expect, test } from '@playwright/test'

// Read-only spec: creates and mutates no rows, so no cleanup is required.
test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 320, height: 640 } })

// dispatchEvent: the Next dev-tools badge overlays the right-most tab in dev.
test.describe('Phone bottom tab bar More sheet', () => {
  test('opens, survives a reload as closed, dismisses via the backdrop, and navigates', async ({
    page,
  }) => {
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    const bar = page.getByRole('navigation', { name: 'Bottom navigation' })
    await expect(bar).toBeVisible()
    const more = bar.getByRole('button', { name: 'More' })
    await expect(more).toBeVisible()

    await more.dispatchEvent('click')
    const sheet = page.locator('#bottom-more-sheet')
    await expect(sheet).toBeVisible()
    await expect(more).toHaveAttribute('aria-expanded', 'true')

    await page.reload()
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(sheet).toHaveCount(0)
    await expect(bar.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )

    await bar.getByRole('button', { name: 'More' }).dispatchEvent('click')
    await expect(sheet).toBeVisible()
    await page.getByRole('button', { name: 'Close menu' }).click({ position: { x: 160, y: 20 } })
    await expect(sheet).toHaveCount(0)
    await expect(page).toHaveURL(/\/app\/dashboard$/)

    await bar.getByRole('button', { name: 'More' }).dispatchEvent('click')
    const link = sheet.getByRole('link').first()
    const href = await link.getAttribute('href')
    if (!href) throw new Error('sheet link has no href')
    await link.click()
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await expect(page).toHaveURL(new RegExp(`${escaped}(/|$)`), { timeout: 30_000 })
    await expect(sheet).toHaveCount(0)
  })

  test('hides the bottom tab bar at the sm breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 })
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Bottom navigation' })).toBeHidden()
  })
})
