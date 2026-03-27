import { expect, test } from '@playwright/test'
import { getAdminClient, TEST_EMAIL, TEST_PASSWORD } from './helpers/supabase'

// Use saved auth state from setup
test.use({ storageState: 'e2e/.auth/user.json' })

// Helper: wait for settings page to be fully loaded
async function gotoSettings(page: import('@playwright/test').Page) {
  await page.goto('/app/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
}

// ── Section 1: Navigation & Profile ──────────────────────────────────────────

test.describe('Settings — Page & Profile', () => {
  test('navigates to settings and sees the heading', async ({ page }) => {
    await gotoSettings(page)
  })

  test('shows the profile card with email and member since', async ({ page }) => {
    await gotoSettings(page)
    await expect(page.getByText('Profile')).toBeVisible()
    await expect(page.getByText(TEST_EMAIL)).toBeVisible()
    await expect(page.getByText('Member since')).toBeVisible()
  })

  test('shows quiz statistics section', async ({ page }) => {
    await gotoSettings(page)
    await expect(page.getByText('Quiz Statistics')).toBeVisible()
    await expect(page.getByText('Sessions')).toBeVisible()
    await expect(page.getByText('Avg. Score')).toBeVisible()
    await expect(page.getByText('Answered')).toBeVisible()
  })
})

// ── Section 2: Display Name ──────────────────────────────────────────────────

test.describe('Settings — Display Name', () => {
  test('shows the display name form with current name', async ({ page }) => {
    await gotoSettings(page)
    await expect(page.getByText('Display Name')).toBeVisible()
    await expect(page.getByLabel('Full name')).toBeVisible()
  })

  test('save button is disabled when name is unchanged', async ({ page }) => {
    await gotoSettings(page)
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test('updates display name successfully', async ({ page }) => {
    await gotoSettings(page)

    const input = page.getByLabel('Full name')
    await expect(input).toBeVisible()
    const originalName = await input.inputValue()

    // Change name
    await input.clear()
    const newName = `E2E Test ${Date.now()}`
    await input.fill(newName)
    await page.getByRole('button', { name: 'Save' }).click()

    // Wait for save button to become disabled again (indicates success)
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled({ timeout: 10_000 })

    // Restore original name
    await input.clear()
    await input.fill(originalName || 'E2E Test Student')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled({ timeout: 10_000 })
  })
})

// ── Section 3: Change Password ───────────────────────────────────────────────

test.describe('Settings — Change Password', () => {
  test('shows the change password form', async ({ page }) => {
    await gotoSettings(page)
    const passwordCard = page.getByText('Change Password')
    await passwordCard.scrollIntoViewIfNeeded()
    await expect(passwordCard).toBeVisible()
    await expect(page.getByLabel('Current password')).toBeVisible()
    await expect(page.getByLabel('New password')).toBeVisible()
    await expect(page.getByLabel('Confirm password')).toBeVisible()
  })

  test('submit button is disabled when fields are empty', async ({ page }) => {
    await gotoSettings(page)
    const btn = page.getByRole('button', { name: 'Update password' })
    await btn.scrollIntoViewIfNeeded()
    await expect(btn).toBeDisabled()
  })

  test('shows validation error for password mismatch', async ({ page }) => {
    await gotoSettings(page)
    await page.getByLabel('Current password').scrollIntoViewIfNeeded()

    await page.getByLabel('Current password').fill('anything')
    await page.getByLabel('New password').fill('newpass123')
    await page.getByLabel('Confirm password').fill('different456')
    await page.getByRole('button', { name: 'Update password' }).click()

    // Use p[role=alert] to avoid matching Next.js route announcer div[role=alert]
    await expect(page.locator('p[role="alert"]')).toContainText('Passwords do not match')
  })

  test('shows error for wrong current password', async ({ page }) => {
    await gotoSettings(page)
    await page.getByLabel('Current password').scrollIntoViewIfNeeded()

    await page.getByLabel('Current password').fill('wrong-password')
    await page.getByLabel('New password').fill('newpass123')
    await page.getByLabel('Confirm password').fill('newpass123')
    await page.getByRole('button', { name: 'Update password' }).click()

    await expect(page.locator('p[role="alert"]')).toContainText('Current password is incorrect', {
      timeout: 10_000,
    })
  })

  test('changes password and changes it back', async ({ page }) => {
    const newPassword = 'e2e-changed-2026!'

    await gotoSettings(page)
    await page.getByLabel('Current password').scrollIntoViewIfNeeded()

    // 1. Change to new password
    await page.getByLabel('Current password').fill(TEST_PASSWORD)
    await page.getByLabel('New password').fill(newPassword)
    await page.getByLabel('Confirm password').fill(newPassword)
    await page.getByRole('button', { name: 'Update password' }).click()

    // Wait for fields to be cleared (success indicator)
    await expect(page.getByLabel('Current password')).toHaveValue('', { timeout: 10_000 })

    // 2. Change back to original password (so future tests work)
    await page.getByLabel('Current password').fill(newPassword)
    await page.getByLabel('New password').fill(TEST_PASSWORD)
    await page.getByLabel('Confirm password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Update password' }).click()
    await expect(page.getByLabel('Current password')).toHaveValue('', { timeout: 10_000 })
  })

  test.afterAll(async () => {
    // Safety net: reset password via admin API in case the change-back test failed
    const admin = getAdminClient()
    const { data } = await admin.auth.admin.listUsers()
    const user = data?.users.find((u: { email?: string }) => u.email === TEST_EMAIL)
    if (user) {
      await admin.auth.admin.updateUserById(user.id, { password: TEST_PASSWORD })
    }
  })
})
