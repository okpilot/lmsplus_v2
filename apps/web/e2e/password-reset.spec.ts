import { expect, test } from '@playwright/test'
import { clearAllMessages, getLatestEmail } from './helpers/mailpit'
import { ensureLoginTestUser, LOGIN_TEST_EMAIL, LOGIN_TEST_PASSWORD } from './helpers/supabase'

// Run without saved auth state — testing the unauthenticated password reset flow
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('password reset flow', () => {
  test.beforeAll(async () => {
    await ensureLoginTestUser()
    await clearAllMessages()
  })

  test('forgot password → email → confirm link → reset password → dashboard', async ({ page }) => {
    // 1. Navigate to forgot-password page from login
    await page.goto('/')
    await page.getByRole('link', { name: /forgot password/i }).click()
    await expect(page).toHaveURL('/auth/forgot-password')

    // 2. Submit the reset email form
    await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
    await page.getByRole('button', { name: /send reset email/i }).click()

    // 3. Verify success message
    await expect(page.getByText(/password reset email/i)).toBeVisible({ timeout: 10_000 })

    // 4. Fetch the reset email from Mailpit
    const email = await getLatestEmail(LOGIN_TEST_EMAIL)
    expect(email.Subject).toContain('Reset')

    // 5. Extract the confirm link from the email HTML
    const confirmLink = extractConfirmLink(email.HTML)
    expect(confirmLink).toBeTruthy()

    // 6. Visit the confirm link — should verify OTP and redirect to /auth/reset-password
    await page.goto(confirmLink)
    await expect(page).toHaveURL('/auth/reset-password', { timeout: 10_000 })

    // 7. Fill in a DIFFERENT password (Supabase rejects same-password updates with 422)
    const newPassword = `${LOGIN_TEST_PASSWORD}-reset`
    await page.getByLabel('New password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm password').fill(newPassword)
    await page.getByRole('button', { name: /update password/i }).click()

    // 8. Should redirect to login page after password update
    await page.waitForURL('/', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()
  })

  test('forgot-password page renders correctly', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByRole('button', { name: /send reset email/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /back to login/i })).toBeVisible()
  })

  test('reset-password page renders form fields', async ({ page }) => {
    // Visit directly — without a valid session this won't let you reset,
    // but the form should still render
    await page.goto('/auth/reset-password')
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Confirm password')).toBeVisible()
    await expect(page.getByRole('button', { name: /update password/i })).toBeVisible()
  })

  test('invalid confirm link shows error on login page', async ({ page }) => {
    await page.goto('/auth/confirm?token_hash=invalid&type=recovery&next=/auth/reset-password')
    await expect(page).toHaveURL(/\?error=invalid_recovery_link/)
    await expect(page.getByText(/reset link is invalid or has expired/i)).toBeVisible()
  })
})

/** Extract the /auth/confirm link from recovery email HTML. */
function extractConfirmLink(html: string): string {
  // Match our custom template: /auth/confirm?token_hash=...&type=recovery&next=...
  const match = html.match(/href="([^"]*\/auth\/confirm[^"]*)"/)
  if (match?.[1]) {
    return match[1].replace(/&amp;/g, '&')
  }

  // Fallback: Supabase default template uses /auth/v1/verify which redirects
  const fallback = html.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)
  if (fallback?.[1]) {
    return fallback[1].replace(/&amp;/g, '&')
  }

  throw new Error('Could not extract confirm link from recovery email')
}
