import { expect, type Page, test } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

// Read-only flow: mocks GET /api/version, creates no rows, so there is nothing to clean up.
const TOAST_TEXT = 'A new version is available'

async function mockVersion(page: Page, current: { value: string }) {
  await page.route('**/api/version', (route) =>
    route.fulfill({ json: { version: current.value }, headers: { 'Cache-Control': 'no-store' } }),
  )
}

async function pollNow(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}

async function pollAndSettle(page: Page) {
  const polled = page.waitForResponse((r) => r.url().includes('/api/version'))
  await pollNow(page)
  await polled
  await page.waitForTimeout(300)
}

test.describe('New version prompt', () => {
  test('shows no toast while the deployment id is unchanged', async ({ page }) => {
    const current = { value: 'dpl_a' }
    await mockVersion(page, current)
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/app\/dashboard/)
    await page.waitForResponse('**/api/version')
    await pollAndSettle(page)
    await expect(page.getByText(TOAST_TEXT)).toHaveCount(0)
  })

  test('offers a reload when a newer deployment appears and reloads on the same page', async ({
    page,
  }) => {
    const current = { value: 'dpl_a' }
    await mockVersion(page, current)
    await page.goto('/app/dashboard')
    await page.waitForResponse('**/api/version')

    current.value = 'dpl_b'
    await expect(async () => {
      await pollNow(page)
      await expect(page.getByText(TOAST_TEXT)).toBeVisible({ timeout: 500 })
    }).toPass()

    await page.getByRole('button', { name: 'Reload' }).click()
    await expect(page).toHaveURL(/\/app\/dashboard/)
    await expect(page.getByText(TOAST_TEXT)).toHaveCount(0)
  })

  test('takes the new deployment as the baseline after a reload', async ({ page }) => {
    const current = { value: 'dpl_a' }
    await mockVersion(page, current)
    await page.goto('/app/dashboard')
    await page.waitForResponse('**/api/version')

    current.value = 'dpl_b'
    await expect(async () => {
      await pollNow(page)
      await expect(page.getByText(TOAST_TEXT)).toBeVisible({ timeout: 500 })
    }).toPass()

    const rebaselined = page.waitForResponse('**/api/version')
    await page.reload()
    await rebaselined
    await expect(page).toHaveURL(/\/app\/dashboard/)
    await pollAndSettle(page)
    await expect(page.getByText(TOAST_TEXT)).toHaveCount(0)
  })

  test('keeps the toast hidden when the version endpoint fails', async ({ page }) => {
    await page.route('**/api/version', (route) => route.fulfill({ status: 500, body: 'x' }))
    await page.goto('/app/dashboard')
    await page.waitForResponse('**/api/version')
    await pollAndSettle(page)
    await expect(page.getByText(TOAST_TEXT)).toHaveCount(0)
  })
})
