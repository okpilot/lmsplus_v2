import { expect, test } from '@playwright/test'
import { ensureTestUser, TEST_EMAIL, TEST_PASSWORD } from './helpers/supabase'

// Run without saved auth state — we want to test the full login flow
test.use({ storageState: { cookies: [], origins: [] } })

test('email + password login flow: fill credentials → dashboard', async ({ page }) => {
  await ensureTestUser()

  // 1. Go to login page
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()

  // 2. Fill in credentials and submit
  await page.getByLabel('Email address').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // 3. Should end up on dashboard
  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
