import { expect, test } from '@playwright/test'
import { fetchRecoveryCode, resetRecoveryThrottle } from './helpers/recovery-code'
import { ensureLoginTestUser, LOGIN_TEST_EMAIL, LOGIN_TEST_PASSWORD } from './helpers/supabase'

// Run without saved auth state — testing the unauthenticated password reset flow
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('password reset flow', () => {
  test.beforeAll(async () => {
    await ensureLoginTestUser()
  })

  // LOGIN_TEST_EMAIL is a persistent, shared account — every test in this file
  // sends it a new reset code, and would eventually throttle the account out of
  // the happy-path test (MAX_RECOVERY_CODES_PER_HOUR).
  test.beforeEach(async () => {
    await resetRecoveryThrottle(LOGIN_TEST_EMAIL)
  })

  // The happy-path test below resets LOGIN_TEST_EMAIL's password to a new value —
  // restore it so the shared login account still authenticates with LOGIN_TEST_PASSWORD
  // for every other spec that reuses it.
  test.afterAll(async () => {
    await ensureLoginTestUser()
  })

  test('forgot password → code → reset password → dashboard', async ({ page }) => {
    // 1. Navigate to forgot-password page from login
    await page.goto('/')
    await page.getByRole('link', { name: /forgot password/i }).click()
    await expect(page).toHaveURL('/auth/forgot-password')

    // 2. Submit the reset request form
    await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
    await page.getByRole('button', { name: 'Send reset code' }).click()

    // 3. Verify the neutral step-2 message and code input appear
    await expect(
      page.getByText(`If an account exists for ${LOGIN_TEST_EMAIL}, we sent a reset code to it.`),
    ).toBeVisible({ timeout: 10_000 })

    // 4. CI has no RESEND_API_KEY, so the app's own send fails closed while the
    // page stays neutral either way — fetch the valid code via the admin API
    // instead of email delivery. This rotates the token, so this IS the code
    // the app will accept.
    const code = await fetchRecoveryCode(LOGIN_TEST_EMAIL)

    // 5. Enter the code — should verify and redirect to /auth/reset-password
    await page.getByLabel('Reset code').fill(code)
    await page.getByRole('button', { name: 'Verify code' }).click()
    await expect(page).toHaveURL('/auth/reset-password', { timeout: 10_000 })

    // 6. Fill in a DIFFERENT password (Supabase rejects same-password updates with 422)
    const newPassword = `${LOGIN_TEST_PASSWORD}-reset`
    await page.getByLabel('New password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm password').fill(newPassword)
    await page.getByRole('button', { name: /update password/i }).click()

    // 7. Should show success confirmation with login link
    await expect(page.getByText(/password has been updated successfully/i)).toBeVisible({
      timeout: 10_000,
    })
    const loginLink = page.getByRole('link', { name: /sign in with your new password/i })
    await expect(loginLink).toBeVisible()

    // 8. Click login link → should go to login page
    await loginLink.click()
    await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()
  })

  test('forgot-password page renders correctly', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send reset code' })).toBeVisible()
    await expect(page.getByRole('link', { name: /back to login/i })).toBeVisible()
  })

  test('reset-password page redirects to login without recovery cookie', async ({ page }) => {
    await page.goto('/auth/reset-password')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()
  })

  test('a wrong code shows the error', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
    await page.getByRole('button', { name: 'Send reset code' }).click()
    await expect(
      page.getByText(`If an account exists for ${LOGIN_TEST_EMAIL}, we sent a reset code to it.`),
    ).toBeVisible({ timeout: 10_000 })

    await page.getByLabel('Reset code').fill('000000')
    await page.getByRole('button', { name: 'Verify code' }).click()
    await expect(page.getByText('That code is invalid or has expired.')).toBeVisible({
      timeout: 10_000,
    })
  })
})
