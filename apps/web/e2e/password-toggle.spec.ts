import { expect, test } from '@playwright/test'
import { ensureLoginTestUser, LOGIN_TEST_EMAIL, LOGIN_TEST_PASSWORD } from './helpers/supabase'

// Creates no rows beyond the shared login test user; no cleanup required.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login password visibility toggle', () => {
  test('shows and hides the password, resets on reload, and signs in', async ({ page }) => {
    await ensureLoginTestUser()
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)

    const password = page.getByLabel('Password', { exact: true })
    await password.fill(LOGIN_TEST_PASSWORD)
    await expect(password).toHaveAttribute('type', 'password')

    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await expect(password).toHaveValue(LOGIN_TEST_PASSWORD)

    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(password).toHaveAttribute('type', 'password')
    await expect(password).toHaveValue(LOGIN_TEST_PASSWORD)

    await page.getByRole('button', { name: 'Show password' }).click()
    await page.reload()
    await expect(page).toHaveURL(/\/$/)
    const reloaded = page.getByLabel('Password', { exact: true })
    await expect(reloaded).toHaveAttribute('type', 'password')
    await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible()

    await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
    await reloaded.fill(LOGIN_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Show password' }).click()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })
})
