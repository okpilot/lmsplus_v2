import { expect, test } from '@playwright/test'
import { ensureNoConsentUser, removeNoConsentUser } from './helpers/no-consent-user'

const CONSENT_TEST_EMAIL = 'e2e-consent-test@lmsplus.local'
const CONSENT_TEST_PASSWORD = 'e2e-consent-test-password-2026!'

// Run without saved auth state — we control auth manually per-test
test.use({ storageState: { cookies: [], origins: [] } })

/** Log in as the consent test user via the login page. */
async function loginAsConsentTestUser(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByLabel('Email address').fill(CONSENT_TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(CONSENT_TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Wait for either dashboard (no gate) or consent page (gate fires)
  await page.waitForURL(/\/(app\/dashboard|consent)/, { timeout: 15_000 })
}

// ── Section 1: Consent gate redirects ────────────────────────────────────────

test.describe
  .serial('Consent gate — redirects and form', () => {
    test.beforeAll(async () => {
      await ensureNoConsentUser({
        email: CONSENT_TEST_EMAIL,
        password: CONSENT_TEST_PASSWORD,
        fullName: 'E2E Consent Test Student',
      })
    })

    test.afterAll(async () => {
      await removeNoConsentUser(CONSENT_TEST_EMAIL)
    })

    // 1. Redirect to /consent when user has no consent records
    test('redirects authenticated user without consent to /consent', async ({ page }) => {
      await loginAsConsentTestUser(page)
      await page.waitForURL('**/consent', { timeout: 15_000 })
      await expect(page).toHaveURL(/\/consent/)
    })

    // 2. Consent form shows required checkboxes and the Continue button
    test('shows consent form with required checkboxes', async ({ page }) => {
      await loginAsConsentTestUser(page)
      await page.waitForURL('**/consent', { timeout: 15_000 })

      await expect(page.getByRole('checkbox', { name: /terms of service/i })).toBeVisible()
      await expect(page.getByRole('checkbox', { name: /privacy policy/i })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    })

    // ── Section 2: Consent form interaction ──────────────────────────────────────

    // 3. Continue button is disabled until both required checkboxes are ticked
    test('disables Continue button until both required checkboxes are checked', async ({
      page,
    }) => {
      await loginAsConsentTestUser(page)
      await page.waitForURL('**/consent', { timeout: 15_000 })

      const continueBtn = page.getByRole('button', { name: 'Continue' })

      // Initially disabled
      await expect(continueBtn).toBeDisabled()

      // Only TOS checked — still disabled
      await page.getByRole('checkbox', { name: /terms of service/i }).check()
      await expect(continueBtn).toBeDisabled()

      // Both required checkboxes checked — enabled
      await page.getByRole('checkbox', { name: /privacy policy/i }).check()
      await expect(continueBtn).toBeEnabled()
    })

    // 4. Submitting consent redirects to dashboard
    test('submits consent and redirects to dashboard', async ({ page }) => {
      await loginAsConsentTestUser(page)
      await page.waitForURL('**/consent', { timeout: 15_000 })

      await page.getByRole('checkbox', { name: /terms of service/i }).check()
      await page.getByRole('checkbox', { name: /privacy policy/i }).check()
      await page.getByRole('button', { name: 'Continue' }).click()

      await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    })

    // ── Section 3: Post-consent access ───────────────────────────────────────────

    // 5. After consent, navigating to dashboard does NOT redirect to /consent
    test('allows access to /app/dashboard after consent', async ({ page }) => {
      // Test 4 left consent records in the DB — this test relies on that state
      await loginAsConsentTestUser(page)
      // Should land on dashboard (gate passes) without visiting /consent
      await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

      // Explicit navigation should also not redirect
      await page.goto('/app/dashboard')
      await expect(page).not.toHaveURL(/\/consent/)
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    })
  })
