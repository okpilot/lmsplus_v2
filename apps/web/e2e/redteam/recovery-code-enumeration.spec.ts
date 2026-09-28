/**
 * Red Team Spec — Vector FV (MEDIUM): account enumeration and send throttle on
 * the forgot-password recovery-code flow (Decisions 103/104).
 *
 * Entry points: `requestRecoveryCode` / `verifyRecoveryCode`
 * (`apps/web/app/auth/forgot-password/actions.ts`), `claimRecoverySlot`
 * (`apps/web/lib/auth/recovery-code.ts`).
 *
 * Attack: an unauthenticated caller probes the reset flow to learn which emails
 *         have accounts, or floods one account with recovery codes.
 * Defense: step 1 answers every valid email with the same copy; step 2 answers a
 *          wrong code and an unknown email with the same message;
 *          `claimRecoverySlot` caps sends at `MAX_RECOVERY_CODES_PER_HOUR`; the
 *          link-based `/auth/confirm` route no longer exists.
 *
 * Out of scope: per-account / per-IP verify limiting (#760).
 */

import { expect, type Page, test } from '@playwright/test'
import { resetRecoveryThrottle } from '../helpers/recovery-code'
import { ensureLoginTestUser, getAdminClient, LOGIN_TEST_EMAIL } from '../helpers/supabase'

test.use({ storageState: { cookies: [], origins: [] } })

// Never provisioned; the flow only reads, so it creates no row to clean up.
const UNKNOWN_EMAIL = 'e2e-redteam-fv-unknown@lmsplus.local'
const NEUTRAL_COPY_RE = /If an account exists for .*, we sent a reset code to it\./
const GENERIC_VERIFY_ERROR = 'That code is invalid or has expired.'
const SEND_SETTLE_MS = 5_000

async function readUserId(email: string): Promise<string> {
  const { data, error } = await getAdminClient()
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle<{ id: string }>()
  if (error) throw new Error(`readUserId (${email}): ${error.message}`)
  if (!data) throw new Error(`readUserId: no user row for ${email}`)
  return data.id
}

/** Number of sends `claimRecoverySlot` has recorded for the account. */
async function readSendCount(userId: string): Promise<number> {
  const { data, error } = await getAdminClient().auth.admin.getUserById(userId)
  if (error) throw new Error(`readSendCount: ${error.message}`)
  const sent: unknown = data.user?.app_metadata?.recovery_code_sent_at
  return Array.isArray(sent) ? sent.length : 0
}

/** Overwrites the throttle counter with `count` recent timestamps. */
async function seedSends(userId: string, count: number): Promise<void> {
  const now = Date.now()
  const stamps = Array.from({ length: count }, (_, i) => new Date(now - i * 1000).toISOString())
  const { error } = await getAdminClient().auth.admin.updateUserById(userId, {
    app_metadata: { recovery_code_sent_at: stamps },
  })
  if (error) throw new Error(`seedSends: ${error.message}`)
}

async function submitStep1(page: Page, email: string): Promise<string> {
  await page.goto('/auth/forgot-password')
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Send reset code' }).click()
  const copy = page.getByText(NEUTRAL_COPY_RE)
  await expect(copy).toBeVisible({ timeout: 10_000 })
  return (await copy.textContent()) ?? ''
}

async function submitStep2(page: Page, code: string): Promise<void> {
  await page.getByLabel('Reset code').fill(code)
  await page.getByRole('button', { name: 'Verify code' }).click()
  await expect(page.getByText(GENERIC_VERIFY_ERROR)).toBeVisible({ timeout: 10_000 })
}

test.describe('Vector FV — recovery-code enumeration and send throttle', () => {
  test.beforeAll(async () => {
    await ensureLoginTestUser()
  })

  test.beforeEach(async () => {
    await resetRecoveryThrottle(LOGIN_TEST_EMAIL)
  })

  test.afterEach(async () => {
    await resetRecoveryThrottle(LOGIN_TEST_EMAIL)
  })

  test('step 1 shows the same copy for a registered and an unregistered email', async ({
    page,
  }) => {
    const knownCopy = await submitStep1(page, LOGIN_TEST_EMAIL)
    const unknownCopy = await submitStep1(page, UNKNOWN_EMAIL)

    expect(knownCopy).toContain(LOGIN_TEST_EMAIL)
    expect(knownCopy.replace(LOGIN_TEST_EMAIL, '<email>')).toBe(
      unknownCopy.replace(UNKNOWN_EMAIL, '<email>'),
    )
  })

  test('step 2 shows the same error for a wrong code and for an unregistered email', async ({
    page,
  }) => {
    await submitStep1(page, LOGIN_TEST_EMAIL)
    await submitStep2(page, '000000')

    await submitStep1(page, UNKNOWN_EMAIL)
    await submitStep2(page, '123456')
  })

  test('no recovery code is issued once the hourly send cap is reached', async ({ page }) => {
    // `next start` without RESEND_API_KEY returns before `claimRecoverySlot`
    // (`isEmailConfigured()`); `next dev` (local runs) reaches it.
    test.skip(!!process.env.CI, 'send path is unreachable under `next start` without email')
    const userId = await readUserId(LOGIN_TEST_EMAIL)

    // Control: under the cap the send is recorded.
    await submitStep1(page, LOGIN_TEST_EMAIL)
    await expect
      .poll(() => readSendCount(userId), { timeout: SEND_SETTLE_MS, intervals: [250] })
      .toBe(1)

    // At the cap: nothing more is recorded.
    await seedSends(userId, 3)
    await submitStep1(page, LOGIN_TEST_EMAIL)
    await page.waitForTimeout(SEND_SETTLE_MS)
    expect(await readSendCount(userId)).toBe(3)
  })

  test('the removed link-based recovery route returns 404', async ({ page }) => {
    const response = await page.request.get('/auth/confirm?token_hash=x&type=recovery')
    expect(response.status()).toBe(404)
  })
})
