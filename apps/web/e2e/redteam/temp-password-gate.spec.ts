/**
 * Red Team Spec — Vector FT (HIGH): Temporary-password forced-change gate
 *
 * Attack surface: an armed account (`users.temp_password_expires_at` set by
 * `record_login_instructions_sent`, Vector FP) must be forced through
 * `/auth/set-password` before it can use the app, and an EXPIRED temp
 * password must be refused, scrambled, and every session for that account
 * revoked. This spec exercises the gate as an attacker would:
 *   1. Can an armed account reach `/app/*` or a Server Action directly,
 *      bypassing the redirect a normal page load would follow?
 *   2. Does an expired temp password actually get rejected, and does the
 *      scramble + global sign-out actually happen (not just the redirect)?
 *   3. Does `/auth/set-password`'s `next` param accept an off-app target?
 *   4. Can an un-armed caller reach the set-password form, or affect a
 *      DIFFERENT user's `temp_password_expires_at`?
 *   5. Does the OTHER self-service password path (forgot-password →
 *      `resetOwnPassword`) also refuse an expired temp password, or does it
 *      offer a side door around the login-path scramble?
 *
 * Defense (traced to source):
 *   - `apps/web/proxy.ts` → `checkTempPasswordGate()`
 *     (`apps/web/lib/auth/temp-password-gate.ts`) runs a DB read on every
 *     `/app` request, before the consent gate. `active` → redirect to
 *     `/auth/set-password?next=<attempted path>`. `expired` →
 *     `expireTempPassword()` then redirect to `/?error=temp_password_expired`.
 *   - `apps/web/app/auth/login-complete/route.ts` runs the identical check
 *     immediately after login, before the consent RPC — and now sets the
 *     consent cookie on the set-password redirect itself when consent is
 *     already satisfied in the DB, so a consented armed user goes
 *     set-password → `next` directly with no `/consent` detour afterward.
 *   - `apps/web/lib/auth/temp-password.ts` `expireTempPassword()` scrambles
 *     the Auth password via `adminClient.auth.admin.updateUserById` (random
 *     32-byte password) and calls `supabase.auth.signOut({ scope: 'global' })`.
 *   - `apps/web/app/auth/set-password/actions.ts` `setOwnPassword()` resolves
 *     the target user via `getUser()` only — no id parameter — so it cannot
 *     be pointed at another user's row.
 *   - `apps/web/app/auth/set-password/page.tsx` computes `nextPath` via
 *     `safeNextPath()` (same allowlist as Vector FO) before ever rendering
 *     the form.
 *   - `apps/web/app/auth/reset-password/actions.ts` `resetOwnPassword()`
 *     calls the same `expireTempPassword()` scramble and refuses with the
 *     identical expiry message BEFORE ever calling `updateUser()`, closing
 *     the forgot-password path as a side door around the login-path refusal.
 *
 * Closes: login-instructions-enforcement branch, PR B (plan-enforcement.md).
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { clearAllMessages, getLatestEmail } from '../helpers/mailpit'
import {
  ensureLoginTestUser,
  getAdminClient,
  LOGIN_TEST_EMAIL,
  LOGIN_TEST_PASSWORD,
} from '../helpers/supabase'
import {
  cleanupTempPasswordStudents,
  createArmedTempPasswordStudent,
  readTempPasswordExpiresAt,
} from '../helpers/temp-password'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const ARMED_PASSWORD = 'redteam-temp-password-armed-2026!'
const EXPIRED_PASSWORD = 'redteam-temp-password-expired-2026!'
const NEW_PASSWORD = 'redteam-temp-password-new-2026!'

function rawAnonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Extract the /auth/confirm link from recovery email HTML (mirrors password-reset.spec.ts). */
function extractConfirmLink(html: string): string {
  const match = html.match(/href="([^"]*\/auth\/confirm[^"]*)"/)
  if (match?.[1]) return match[1].replace(/&amp;/g, '&')
  const fallback = html.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)
  if (fallback?.[1]) return fallback[1].replace(/&amp;/g, '&')
  throw new Error('Could not extract confirm link from recovery email')
}

test.describe('Red Team: Temporary-password forced-change gate (Vector FT)', () => {
  test.afterEach(async () => {
    await cleanupTempPasswordStudents()
  })

  // ---------------------------------------------------------------------
  // Direct access while armed — several /app pages, plus a Server Action POST
  // ---------------------------------------------------------------------

  test('an armed account cannot reach several /app pages directly, and is always sent to set-password', async ({
    browser,
  }) => {
    const { email } = await createArmedTempPasswordStudent({
      password: ARMED_PASSWORD,
      expiresInMs: SEVEN_DAYS_MS,
    })

    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    try {
      await page.goto('/')
      await page.getByLabel('Email address').fill(email)
      await page.getByLabel('Password', { exact: true }).fill(ARMED_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL('**/auth/set-password**', { timeout: 15_000 })

      // Cookies are now in the context — hit several distinct /app pages
      // directly via the API context (bypasses client-side navigation and
      // any UI-level guard, exercising the proxy gate itself).
      const targets = ['/app/dashboard', '/app/progress', '/app/quiz', '/app/settings']
      for (const target of targets) {
        const response = await context.request.fetch(target, { maxRedirects: 0 })
        expect(
          response.status(),
          `expected a redirect for ${target} while armed; a 200 means the gate was bypassed`,
        ).toBeGreaterThanOrEqual(300)
        expect(response.status()).toBeLessThan(400)
        const location = new URL(response.headers().location ?? '', 'http://localhost:3000')
        expect(location.pathname, `${target} must bounce to /auth/set-password`).toBe(
          '/auth/set-password',
        )
      }
    } finally {
      await context.close()
    }
  })

  test('a Server Action POST to an /app path is not served while armed', async ({ browser }) => {
    const { email } = await createArmedTempPasswordStudent({
      password: ARMED_PASSWORD,
      expiresInMs: SEVEN_DAYS_MS,
    })

    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    try {
      await page.goto('/')
      await page.getByLabel('Email address').fill(email)
      await page.getByLabel('Password', { exact: true }).fill(ARMED_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL('**/auth/set-password**', { timeout: 15_000 })

      // A Server Action call is itself a POST to the page's own URL. The
      // proxy matcher runs for every HTTP method, so a POST must be
      // intercepted the same as a GET — never reaching the route/action.
      const response = await context.request.post('/app/settings', { maxRedirects: 0 })
      expect(
        response.status(),
        'a POST to /app/settings while armed must not be served (200 would mean the action handler ran)',
      ).not.toBe(200)
      expect(response.status()).toBeGreaterThanOrEqual(300)
      expect(response.status()).toBeLessThan(400)
      const location = new URL(response.headers().location ?? '', 'http://localhost:3000')
      expect(location.pathname).toBe('/auth/set-password')
    } finally {
      await context.close()
    }
  })

  // ---------------------------------------------------------------------
  // Expired temp password: refused, scrambled, signed out everywhere
  // ---------------------------------------------------------------------

  test('an expired temp password is refused, scrambled, and revokes a token captured before the hit', async ({
    browser,
  }) => {
    const { email } = await createArmedTempPasswordStudent({
      password: EXPIRED_PASSWORD,
      expiresInMs: -1_000,
    })

    // Capture a live session BEFORE the app ever sees this account — proves
    // the credential works and a refresh token exists, so the later
    // "no longer refreshes" assertion isn't vacuously true because no
    // session was ever obtainable.
    const capture = rawAnonClient()
    const { data: signInData, error: signInError } = await capture.auth.signInWithPassword({
      email,
      password: EXPIRED_PASSWORD,
    })
    expect(signInError, 'the temp password must work before any gate has fired').toBeNull()
    const capturedRefreshToken = signInData.session?.refresh_token
    expect(capturedRefreshToken, 'a refresh token must have been issued').toBeTruthy()

    // Now trigger the gate for real, through the browser login flow.
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await page.goto('/')
      await page.getByLabel('Email address').fill(email)
      await page.getByLabel('Password', { exact: true }).fill(EXPIRED_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()

      await page.waitForURL('**/?error=temp_password_expired', { timeout: 15_000 })
      const url = new URL(page.url())
      expect(url.pathname).toBe('/')
      expect(url.searchParams.get('error')).toBe('temp_password_expired')
      await expect(
        page.getByText(
          'Your temporary password has expired. Ask your instructor to send you new login instructions.',
        ),
      ).toBeVisible()
    } finally {
      await context.close()
    }

    // The refresh token captured before the hit must now be dead — proves
    // the global sign-out actually revoked sessions, not just the redirect.
    const refreshCheck = rawAnonClient()
    const { error: refreshError } = await refreshCheck.auth.refreshSession({
      refresh_token: capturedRefreshToken as string,
    })
    expect(
      refreshError,
      'a refresh token captured before the hit must no longer refresh',
    ).not.toBeNull()

    // The original temp password must no longer authenticate — proves the
    // scramble actually replaced the Auth password, not just the DB column.
    const passwordCheck = rawAnonClient()
    const { error: staleLoginError } = await passwordCheck.auth.signInWithPassword({
      email,
      password: EXPIRED_PASSWORD,
    })
    expect(
      staleLoginError,
      'the original temp password must no longer sign in after expiry',
    ).not.toBeNull()
  })

  test('a forgot-password completion also refuses an expired temp password, scrambling it the same way', async ({
    page,
  }) => {
    const { email } = await createArmedTempPasswordStudent({
      password: EXPIRED_PASSWORD,
      expiresInMs: -1_000,
    })
    await clearAllMessages()

    // Drive the real forgot-password flow (same as password-reset.spec.ts) —
    // this reaches resetOwnPassword() through a normal form submission, no
    // Server Action wire protocol needed.
    await page.goto('/auth/forgot-password')
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: /send reset email/i }).click()
    await expect(page.getByText(/password reset email/i)).toBeVisible({ timeout: 10_000 })

    const sentEmail = await getLatestEmail(email)
    const confirmLink = extractConfirmLink(sentEmail.HTML)
    await page.goto(confirmLink)
    await expect(page).toHaveURL('/auth/reset-password', { timeout: 10_000 })

    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: /update password/i }).click()

    // resetOwnPassword() refuses before ever calling updateUser() — same
    // refusal message as the login-path expiry, not a generic failure.
    await expect(
      page.getByText(
        'Your temporary password has expired. Ask your instructor to send you new login instructions.',
      ),
    ).toBeVisible({ timeout: 10_000 })

    // Non-vacuous: the temp password must no longer sign in — the refusal
    // path scrambles the same way expireTempPassword() does on the login
    // path, not just returning an error while leaving the password intact.
    const passwordCheck = rawAnonClient()
    const { error: staleLoginError } = await passwordCheck.auth.signInWithPassword({
      email,
      password: EXPIRED_PASSWORD,
    })
    expect(
      staleLoginError,
      'the original temp password must no longer sign in after a refused reset',
    ).not.toBeNull()

    // The NEW password must never have taken effect either — the refusal
    // happens before updateUser() is called.
    const newPasswordCheck = rawAnonClient()
    const { error: newLoginError } = await newPasswordCheck.auth.signInWithPassword({
      email,
      password: NEW_PASSWORD,
    })
    expect(
      newLoginError,
      'the attempted new password must not sign in — the reset was refused, not applied',
    ).not.toBeNull()
  })

  // ---------------------------------------------------------------------
  // `next` validation on /auth/set-password
  // ---------------------------------------------------------------------

  test('an off-app or /auth next on set-password falls back to the dashboard, never the attacker target', async ({
    browser,
  }) => {
    const hostileNextValues = ['https://evil.example', '/auth/callback']

    for (const hostileNext of hostileNextValues) {
      // A fresh throwaway student per value — the previous iteration already
      // consumed its student's temp password (set-password clears the gate),
      // so reusing one email across iterations would fail the second sign-in.
      const { email } = await createArmedTempPasswordStudent({
        password: ARMED_PASSWORD,
        expiresInMs: SEVEN_DAYS_MS,
      })

      const context = await browser.newContext({ storageState: undefined })
      const page = await context.newPage()
      try {
        await page.goto('/')
        await page.getByLabel('Email address').fill(email)
        await page.getByLabel('Password', { exact: true }).fill(ARMED_PASSWORD)
        await page.getByRole('button', { name: 'Sign in' }).click()
        await page.waitForURL('**/auth/set-password**', { timeout: 15_000 })

        await page.goto(`/auth/set-password?next=${encodeURIComponent(hostileNext)}`)
        await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible()

        // Track every frame navigation from here — /auth/login-complete now
        // sets the consent cookie on the set-password redirect when consent
        // is already satisfied (DB), so this hard nav must land on
        // /app/dashboard directly, with NO /consent detour.
        const navigatedUrls: string[] = []
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) navigatedUrls.push(frame.url())
        })

        await page.getByLabel('New password').fill(NEW_PASSWORD)
        await page.getByLabel('Confirm password').fill(NEW_PASSWORD)
        await page.getByRole('button', { name: 'Set password' }).click()

        await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
        expect(navigatedUrls.some((u) => u.includes('/consent'))).toBe(false)
        const url = new URL(page.url())
        expect(url.pathname, `next=${hostileNext} must fall back to /app/dashboard`).toBe(
          '/app/dashboard',
        )
        expect(url.href).not.toContain('evil.example')
      } finally {
        await context.close()
      }
    }
  })

  // ---------------------------------------------------------------------
  // Un-armed caller closed out of set-password; no cross-user reach
  // ---------------------------------------------------------------------

  test('an un-armed logged-in user cannot reach set-password, and a separate armed user is unaffected', async ({
    browser,
  }) => {
    await ensureLoginTestUser()

    const { userId: victimUserId } = await createArmedTempPasswordStudent({
      password: ARMED_PASSWORD,
      expiresInMs: SEVEN_DAYS_MS,
    })

    // Non-vacuous baseline: the victim really is armed before the attempt.
    const before = await readTempPasswordExpiresAt(victimUserId)
    expect(before, 'the victim must be armed before the attempt').not.toBeNull()

    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await page.goto('/')
      await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
      await page.getByLabel('Password', { exact: true }).fill(LOGIN_TEST_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL('**/app/dashboard', { timeout: 15_000 })

      // `setOwnPassword` reads only `getUser()` — there is no id parameter to
      // aim at another user's row, so no wire-level attack surface exists to
      // exercise here. What IS reachable and worth pinning: the un-armed
      // caller never even reaches the form — page.tsx redirects them away
      // before the client-side action becomes callable at all.
      await page.goto('/auth/set-password')
      await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
      const url = new URL(page.url())
      expect(url.pathname).toBe('/app/dashboard')
      await expect(page.getByRole('heading', { name: 'Set your password' })).not.toBeVisible()
    } finally {
      await context.close()
    }

    // Non-vacuous: the victim's column is unchanged and still non-null —
    // the un-armed caller's attempt touched nothing belonging to them.
    const admin = getAdminClient()
    const { data: victimRow, error: victimError } = await admin
      .from('users')
      .select('id')
      .eq('id', victimUserId)
      .is('deleted_at', null)
      .maybeSingle()
    expect(victimError).toBeNull()
    expect(
      victimRow,
      'the victim row must still exist for this comparison to mean anything',
    ).not.toBeNull()

    const after = await readTempPasswordExpiresAt(victimUserId)
    expect(after, 'the victim must still be armed after the attempt').not.toBeNull()
    expect(after).toBe(before)
  })
})
