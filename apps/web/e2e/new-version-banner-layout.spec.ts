import { expect, type Page, test } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

const BANNER_TEXT = 'A new version is available.'

async function showBanner(page: Page) {
  const current = { value: 'dpl_a' }
  await page.route('**/api/version', (route) =>
    route.fulfill({ json: { version: current.value }, headers: { 'Cache-Control': 'no-store' } }),
  )
  const baseline = page.waitForResponse('**/api/version')
  await page.goto('/app/dashboard')
  await baseline
  current.value = 'dpl_b'
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 500 })
  }).toPass()
  await page.getByRole('button', { name: 'Later' }).click()
  const banner = page.getByRole('status').filter({ hasText: BANNER_TEXT })
  await expect(banner).toBeVisible()
  return banner
}

const publishedHeight = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue('--reload-banner-h'))

test.describe('Reload banner layout', () => {
  test('publishes its height and fits a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    const banner = await showBanner(page)

    const box = await banner.boundingBox()
    if (!box) throw new Error('banner has no box')
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(await publishedHeight(page)).toBe(`${box.height}px`)
  })
})
