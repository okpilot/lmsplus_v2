import { expect, test as setup } from '@playwright/test'
import {
  ADMIN_TEST_EMAIL,
  ADMIN_TEST_PASSWORD,
  ensureAdminTestUser,
} from './helpers/admin-supabase'

const ADMIN_AUTH_FILE = 'e2e/.auth/admin.json'

setup('create admin authenticated session', async ({ page }) => {
  await ensureAdminTestUser()

  await page.goto('/')
  await page.getByLabel('Email address').fill(ADMIN_TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.context().storageState({ path: ADMIN_AUTH_FILE })
})
