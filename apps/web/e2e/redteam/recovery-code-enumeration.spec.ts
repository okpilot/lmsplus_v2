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

import { expect, type Page, type Request, test } from '@playwright/test'
import { readRecoverySentAt, readUserId, resetRecoveryThrottle } from '../helpers/recovery-code'
import { ensureLoginTestUser, getAdminClient, LOGIN_TEST_EMAIL } from '../helpers/supabase'

test.use({ storageState: { cookies: [], origins: [] } })

// Never provisioned; the flow only reads, so it creates no row to clean up.
const UNKNOWN_EMAIL = 'e2e-redteam-fv-unknown@lmsplus.local'
const NEUTRAL_COPY_RE = /If an account exists for .*, we sent a reset code to it\./
const GENERIC_VERIFY_ERROR = 'That code is invalid or has expired.'
const SEND_SETTLE_MS = 5_000
// `VERIFY_MIN_DURATION_MS` in `app/auth/forgot-password/actions.ts`.
const VERIFY_FLOOR_MS = 1_500

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

type ActionResult = { body: string; ms: number }

function isServerAction(request: Request): boolean {
  return request.method() === 'POST' && request.headers()['next-action'] !== undefined
}

/**
 * Clicks `button` and returns the Server Action's response body and server round-trip in
 * milliseconds, both taken in the test process so a client-side re-render cannot discard them.
 */
async function submitAction(page: Page, button: string): Promise<ActionResult> {
  let captured: ActionResult | undefined
  await page.route('**/*', async (route) => {
    if (!isServerAction(route.request())) return route.fallback()
    const start = Date.now()
    const response = await route.fetch()
    const body = await response.text()
    captured = { body, ms: Date.now() - start }
    await route.fulfill({ response, body })
  })
  await page.getByRole('button', { name: button }).click()
  await expect.poll(() => captured, { timeout: 10_000 }).toBeDefined()
  await page.unroute('**/*')
  return captured as ActionResult
}

/** Returns the rendered copy and the raw Server Action response body. */
async function submitStep1(page: Page, email: string): Promise<{ copy: string; body: string }> {
  await page.goto('/auth/forgot-password')
  await page.getByLabel('Email address').fill(email)
  const { body } = await submitAction(page, 'Send reset code')
  const copy = page.getByText(NEUTRAL_COPY_RE)
  await expect(copy).toBeVisible({ timeout: 10_000 })
  return { copy: (await copy.textContent()) ?? '', body }
}

/** Returns the verify Server Action's server round-trip in milliseconds. */
async function submitStep2(page: Page, code: string): Promise<number> {
  await page.getByLabel('Reset code').fill(code)
  const { ms } = await submitAction(page, 'Verify code')
  await expect(page.getByText(GENERIC_VERIFY_ERROR)).toBeVisible({ timeout: 10_000 })
  return ms
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
    const known = await submitStep1(page, LOGIN_TEST_EMAIL)
    const unknown = await submitStep1(page, UNKNOWN_EMAIL)

    expect(known.body).not.toBe('')
    expect(known.body).toBe(unknown.body)
    expect(known.copy).toContain(LOGIN_TEST_EMAIL)
    expect(known.copy.replace(LOGIN_TEST_EMAIL, '<email>')).toBe(
      unknown.copy.replace(UNKNOWN_EMAIL, '<email>'),
    )
  })

  test('step 2 shows the same error, no sooner than the floor, for a wrong code and for an unregistered email', async ({
    page,
  }) => {
    await submitStep1(page, LOGIN_TEST_EMAIL)
    const knownMs = await submitStep2(page, '000000')

    await submitStep1(page, UNKNOWN_EMAIL)
    const unknownMs = await submitStep2(page, '123456')

    expect(knownMs).toBeGreaterThanOrEqual(VERIFY_FLOOR_MS)
    expect(unknownMs).toBeGreaterThanOrEqual(VERIFY_FLOOR_MS)
  })

  test('no recovery code is issued once the hourly send cap is reached', async ({ page }) => {
    // `next start` without RESEND_API_KEY returns before `claimRecoverySlot`
    // (`isEmailConfigured()`); `next dev` (local runs) reaches it.
    test.skip(!!process.env.CI, 'send path is unreachable under `next start` without email')
    const userId = await readUserId(LOGIN_TEST_EMAIL)

    // Control: under the cap the send is recorded and a code is issued.
    const issuedBefore = await readRecoverySentAt(userId)
    await submitStep1(page, LOGIN_TEST_EMAIL)
    await expect
      .poll(() => readSendCount(userId), { timeout: SEND_SETTLE_MS, intervals: [250] })
      .toBe(1)
    await expect
      .poll(() => readRecoverySentAt(userId), { timeout: SEND_SETTLE_MS, intervals: [250] })
      .not.toBe(issuedBefore)

    // At the cap: nothing more is recorded and no code is issued.
    await seedSends(userId, 3)
    const issuedAtCap = await readRecoverySentAt(userId)
    await submitStep1(page, LOGIN_TEST_EMAIL)
    await page.waitForTimeout(SEND_SETTLE_MS)
    expect(await readSendCount(userId)).toBe(3)
    expect(await readRecoverySentAt(userId)).toBe(issuedAtCap)
  })

  test('the removed link-based recovery route returns 404', async ({ page }) => {
    const response = await page.request.get('/auth/confirm?token_hash=x&type=recovery')
    expect(response.status()).toBe(404)
  })
})
