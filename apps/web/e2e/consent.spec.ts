import { expect, test } from '@playwright/test'
import { getAdminClient } from './helpers/supabase'

const CONSENT_TEST_EMAIL = 'e2e-consent-test@lmsplus.local'
const CONSENT_TEST_PASSWORD = 'e2e-consent-test-password-2026!'

// Run without saved auth state — we control auth manually per-test
test.use({ storageState: { cookies: [], origins: [] } })

/**
 * Creates the consent test user in the Egmont Aviation org WITHOUT seeding
 * consent records — the whole point is to test the gate before consent is given.
 */
async function ensureConsentTestUser(
  admin: ReturnType<typeof getAdminClient>,
  orgId: string,
): Promise<string> {
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw new Error(`ensureConsentTestUser listUsers: ${listError.message}`)

  const existingAuth = existingUsers?.users.find(
    (u: { email?: string }) => u.email === CONSENT_TEST_EMAIL,
  )

  let userId: string
  if (existingAuth) {
    userId = existingAuth.id
    const { error: resetError } = await admin.auth.admin.updateUserById(userId, {
      password: CONSENT_TEST_PASSWORD,
    })
    if (resetError) throw new Error(`ensureConsentTestUser reset password: ${resetError.message}`)

    // Remove any existing consent records so the gate fires on every test run
    const { error: deleteError } = await admin.from('user_consents').delete().eq('user_id', userId)
    if (deleteError) {
      console.error('[ensureConsentTestUser] Failed to clear consents:', deleteError.message)
    }
  } else {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: CONSENT_TEST_EMAIL,
      password: CONSENT_TEST_PASSWORD,
      email_confirm: true,
    })
    if (authError) throw new Error(`ensureConsentTestUser auth: ${authError.message}`)
    userId = authData.user.id
  }

  const { data: userRow, error: userRowError } = await admin
    .from('users')
    .select('id, organization_id')
    .eq('id', userId)
    .single()

  if (userRowError && userRowError.code !== 'PGRST116') {
    throw new Error(`ensureConsentTestUser user lookup: ${userRowError.message}`)
  }

  if (!userRow) {
    const { error: userError } = await admin.from('users').insert({
      id: userId,
      organization_id: orgId,
      email: CONSENT_TEST_EMAIL,
      full_name: 'E2E Consent Test Student',
      role: 'student',
    })
    if (userError) throw new Error(`ensureConsentTestUser public: ${userError.message}`)
  } else if (userRow.organization_id !== orgId) {
    const { error: updateError } = await admin
      .from('users')
      .update({ organization_id: orgId })
      .eq('id', userId)
    if (updateError) throw new Error(`ensureConsentTestUser update org: ${updateError.message}`)
  }

  // Intentionally NOT seeding consent records — the gate must fire
  return userId
}

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
      const admin = getAdminClient()
      const { data: org, error: orgError } = await admin
        .from('organizations')
        .select('id')
        .eq('slug', 'egmont-aviation')
        .single()
      if (orgError || !org) throw new Error(`consent setup org lookup: ${orgError?.message}`)
      await ensureConsentTestUser(admin, org.id)
    })

    test.afterAll(async () => {
      const admin = getAdminClient()

      const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
      if (listError) {
        console.error('[afterAll] listUsers failed:', listError.message)
        return
      }
      const authUser = existingUsers?.users.find(
        (u: { email?: string }) => u.email === CONSENT_TEST_EMAIL,
      )
      if (!authUser) {
        console.warn('[afterAll] Consent test user not found:', CONSENT_TEST_EMAIL)
        return
      }

      // Delete consent records first (FK constraint)
      const { error: consentDeleteError } = await admin
        .from('user_consents')
        .delete()
        .eq('user_id', authUser.id)
      if (consentDeleteError) {
        console.error('[afterAll] Failed to delete consent records:', consentDeleteError.message)
      }

      // Delete the auth user (cascades to public.users)
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(authUser.id)
      if (deleteUserError) {
        console.error('[afterAll] Failed to delete auth user:', deleteUserError.message)
      }
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
