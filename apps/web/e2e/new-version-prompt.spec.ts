import { expect, type Page, test } from '@playwright/test'
import { startStudyQuiz } from './helpers/quiz-session'
import { resetStudentQuizSessions, SESSION_ID_URL } from './helpers/quiz-session-id'
import { TEST_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

// Read-only flow: mocks GET /api/version, creates no rows, so there is nothing to clean up.
const DIALOG_TITLE = 'A new version is available'
const BANNER_TEXT = 'A new version is available.'

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

// A live quiz suppresses the poll: a triggered check makes no version request and no prompt shows.
async function pollSuppressed(page: Page) {
  let requested = 0
  const count = (r: { url(): string }) => {
    if (r.url().includes('/api/version')) requested += 1
  }
  page.on('request', count)
  await pollNow(page)
  await page.waitForTimeout(500)
  page.off('request', count)
  expect(requested).toBe(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: BANNER_TEXT })).toHaveCount(0)
}

test.describe('New version prompt', () => {
  test('shows no prompt while the deployment id is unchanged', async ({ page }) => {
    const current = { value: 'dpl_a' }
    await mockVersion(page, current)
    const baseline = page.waitForResponse('**/api/version')
    await page.goto('/app/dashboard')
    await baseline
    await pollAndSettle(page)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  })

  test('offers a reload when a newer deployment appears and reloads on the same page', async ({
    page,
  }) => {
    const current = { value: 'dpl_a' }
    await mockVersion(page, current)
    const baseline = page.waitForResponse('**/api/version')
    await page.goto('/app/dashboard')
    await baseline

    current.value = 'dpl_b'
    await expect(async () => {
      await pollNow(page)
      await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 500 })
    }).toPass()

    await page.getByRole('button', { name: 'Reload now' }).click()
    await expect(page).toHaveURL(/\/app\/dashboard/)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  })

  test('takes the new deployment as the baseline after a reload', async ({ page }) => {
    const current = { value: 'dpl_a' }
    await mockVersion(page, current)
    const baseline = page.waitForResponse('**/api/version')
    await page.goto('/app/dashboard')
    await baseline

    current.value = 'dpl_b'
    await expect(async () => {
      await pollNow(page)
      await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 500 })
    }).toPass()

    const rebaselined = page.waitForResponse('**/api/version')
    await page.reload()
    await rebaselined
    await expect(page).toHaveURL(/\/app\/dashboard/)
    await pollAndSettle(page)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  })

  test('keeps a reload banner after Later, across navigation, until reloaded', async ({ page }) => {
    const current = { value: 'dpl_a' }
    await mockVersion(page, current)
    const baseline = page.waitForResponse('**/api/version')
    await page.goto('/app/dashboard')
    await baseline

    current.value = 'dpl_b'
    await expect(async () => {
      await pollNow(page)
      await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 500 })
    }).toPass()
    await expect(page.getByText(DIALOG_TITLE)).toBeVisible()

    await page.getByRole('button', { name: 'Later' }).click()
    const banner = page.getByRole('status').filter({ hasText: BANNER_TEXT })
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(banner).toBeVisible()

    await page.locator('a[href="/app/quiz"]:visible').first().click()
    await expect(page).toHaveURL(/\/app\/quiz$/)
    await expect(banner).toBeVisible()

    await banner.getByRole('button', { name: 'Reload', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/quiz/)
    await expect(banner).toHaveCount(0)
  })

  test('keeps the prompt hidden when the version endpoint fails', async ({ page }) => {
    await page.route('**/api/version', (route) => route.fulfill({ status: 500, body: 'x' }))
    const baseline = page.waitForResponse('**/api/version')
    await page.goto('/app/dashboard')
    await baseline
    await pollAndSettle(page)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  })
})

test.describe('New version prompt during a live quiz', () => {
  test.afterEach(async () => {
    await resetStudentQuizSessions(TEST_EMAIL)
  })

  test('hides a pending dialog on entering a quiz and stays silent through a reload', async ({
    page,
  }) => {
    const current = { value: 'dpl_a' }
    await mockVersion(page, current)
    const baseline = page.waitForResponse('**/api/version')
    await page.goto('/app/dashboard')
    await baseline

    current.value = 'dpl_b'
    await expect(async () => {
      await pollNow(page)
      await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 500 })
    }).toPass()

    await startStudyQuiz(page)
    await expect(page).toHaveURL(SESSION_ID_URL)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    await pollSuppressed(page)

    const rebaselined = page.waitForResponse('**/api/version')
    await page.reload()
    await rebaselined
    await expect(page).toHaveURL(SESSION_ID_URL)
    await pollSuppressed(page)
  })
})
