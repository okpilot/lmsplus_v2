import { expect, test } from '@playwright/test'
import { ensureLoginTestUser, LOGIN_TEST_EMAIL, LOGIN_TEST_PASSWORD } from './helpers/supabase'

// Dedicated login user + fresh context: signOut revokes the session server-side,
// which would invalidate the shared storageState used by other specs.
test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1280, height: 800 },
})

test('signing out lands on the login page and /app stays protected after reload', async ({
  page,
}) => {
  await ensureLoginTestUser()

  await page.goto('/')
  await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(LOGIN_TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })

  await page.reload()
  await expect(page).toHaveURL(/\/app\/dashboard$/)

  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/$/)

  await page.goto('/app/dashboard')
  await expect(page).not.toHaveURL(/\/app\/dashboard$/)
  await expect(page.getByLabel('Email address')).toBeVisible()
})
