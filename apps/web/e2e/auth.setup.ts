import { expect, test as setup } from '@playwright/test'
import { ensureTestUser, TEST_EMAIL, TEST_PASSWORD } from './helpers/supabase'

const AUTH_FILE = 'e2e/.auth/user.json'

setup('create authenticated session', async ({ page }) => {
  await ensureTestUser()

  await page.goto('/')
  await page.getByLabel('Email address').fill(TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.context().storageState({ path: AUTH_FILE })
})
