/**
 * Red Team Spec — Vector FO (HIGH): Open redirect via the post-login `?next=` param
 *
 * Attack: A logged-out user who lands on `/app/...` is bounced to `/` carrying
 *         `?next=<that path>` (fix/login-return-to) so login returns them to it.
 *         An attacker who controls the `next` value — a crafted deep link, or a
 *         forged `/auth/login-complete?next=` request against an already-signed-in
 *         victim — tries to redirect the post-login browser off the app origin.
 * Defense: `apps/web/lib/auth/safe-next-path.ts` (`safeNextPath`) validates every
 *          `next` value read by the proxy's authenticated `/` redirect, the login page
 *          (`app/page.tsx`), the consent page (`app/consent/page.tsx`) and
 *          `/auth/login-complete` — same-origin `/app/...`
 *          paths only. It rejects: a different origin (absolute URL or `//host`
 *          protocol-relative, including `/\host`, which URL parsing reads as `//host`),
 *          any literal backslash, a path that normalizes outside
 *          `/app` (`/app/../...`), and a non-http(s) scheme (`javascript:`, whose
 *          `URL.origin` is the string `"null"`). A rejected value falls back to
 *          `/app/dashboard`.
 *
 *          Different attack surface from Vector X (`pkce-state.spec.ts`), which
 *          covers `/auth/callback`'s own `next` param via `ALLOWED_NEXT_PATHS` —
 *          disjoint code path, disjoint allowlist.
 */

import { expect, test } from '@playwright/test'
import { CURRENT_PRIVACY_VERSION, CURRENT_TOS_VERSION } from '../../lib/consent/versions'
import { ensureNoConsentUser, removeNoConsentUser } from '../helpers/no-consent-user'
import { getAdminClient } from '../helpers/supabase'
import { seedConsentRecords } from './helpers/seed-consent'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'

const OPEN_REDIRECT_EMAIL = 'redteam-open-redirect@lmsplus.local'
const OPEN_REDIRECT_PASSWORD = 'redteam-open-redirect-2026!'
const NO_CONSENT_EMAIL = 'redteam-open-redirect-consent@lmsplus.local'
const NO_CONSENT_PASSWORD = 'redteam-open-redirect-consent-2026!'

const HOSTILE_NEXT_VALUES = [
  { name: 'protocol-relative host swap', value: '//evil.example' },
  { name: 'absolute off-origin URL', value: 'https://evil.example/app' },
  { name: 'backslash host swap', value: '/\\evil.example' },
  { name: 'dot-dot path escape out of /app', value: '/app/../auth/reset-password' },
  { name: 'javascript: pseudo-protocol', value: 'javascript:alert(1)' },
] as const

test.describe('Red Team: Open redirect via `next` (Vector FO)', () => {
  let userId: string

  test.beforeAll(async () => {
    const admin = getAdminClient()
    const orgId = await getEgmontOrgId(admin)
    userId = await upsertUser(admin, OPEN_REDIRECT_EMAIL, OPEN_REDIRECT_PASSWORD, orgId)
    // Consented, so login-complete always lands on a single deterministic
    // destination (dashboard or the validated next) instead of branching to /consent.
    await seedConsentRecords(userId)
  })

  test.afterAll(async () => {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('user_consents')
      .delete()
      .eq('user_id', userId)
      .in('document_version', [CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION])
      .select('id')
    if (error) {
      throw new Error(`open-redirect-next cleanup: user_consents delete failed: ${error.message}`)
    }
    if ((data?.length ?? 0) > 0) {
      console.log(`[open-redirect-next cleanup] removed ${data?.length} consent row(s)`)
    }
  })

  /**
   * Non-vacuous positive control: proves `next` IS honoured for a legitimate
   * same-app destination, so the hostile-value tests below aren't vacuously
   * passing because `next` is never forwarded at all.
   */
  test('a same-app next destination is honoured after login', async ({ page, baseURL }) => {
    await page.goto(`/?next=${encodeURIComponent('/app/internal-exam')}`)

    await page.getByLabel('Email address').fill(OPEN_REDIRECT_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(OPEN_REDIRECT_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.waitForURL('**/app/internal-exam', { timeout: 15_000 })
    const url = new URL(page.url())
    const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin
    expect(url.origin).toBe(appOrigin)
    expect(url.pathname).toBe('/app/internal-exam')
  })

  for (const { name, value } of HOSTILE_NEXT_VALUES) {
    test(`a next of ${name} falls back to the dashboard, never off-origin`, async ({
      page,
      baseURL,
    }) => {
      await page.goto(`/?next=${encodeURIComponent(value)}`)

      await page.getByLabel('Email address').fill(OPEN_REDIRECT_EMAIL)
      await page.getByLabel('Password', { exact: true }).fill(OPEN_REDIRECT_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()

      await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
      const url = new URL(page.url())
      const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin

      // Positive: landed on the app origin, on the safe default destination.
      expect(url.origin).toBe(appOrigin)
      expect(url.pathname).toBe('/app/dashboard')
      // Negative companion: did not carry the attacker host into the origin.
      expect(url.origin).not.toContain('evil.example')
    })
  }

  /**
   * A forged `next` against `/auth/login-complete` directly — the same guard,
   * exercised on an already-authenticated caller rather than through the login
   * form. Signs in first: the redteam project has no storageState dependency,
   * so each test starts logged out.
   */
  test('an authenticated GET of /auth/login-complete with a protocol-relative next stays on the dashboard', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/')
    await page.getByLabel('Email address').fill(OPEN_REDIRECT_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(OPEN_REDIRECT_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })

    await page.goto(`/auth/login-complete?next=${encodeURIComponent('//evil.example')}`)

    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
    const url = new URL(page.url())
    const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin
    expect(url.origin).toBe(appOrigin)
    expect(url.pathname).toBe('/app/dashboard')
    expect(url.origin).not.toContain('evil.example')
  })

  test('a signed-in user following a crafted /?next= link stays on the dashboard', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/')
    await page.getByLabel('Email address').fill(OPEN_REDIRECT_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(OPEN_REDIRECT_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })

    await page.goto(`/?next=${encodeURIComponent('//evil.example')}`)

    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
    const url = new URL(page.url())
    expect(url.origin).toBe(new URL(baseURL ?? 'http://localhost:3000').origin)
    expect(url.pathname).toBe('/app/dashboard')
  })
})

test.describe
  .serial('Red Team: Open redirect via `next` on the consent page (Vector FO)', () => {
    test.beforeAll(async () => {
      await ensureNoConsentUser({
        email: NO_CONSENT_EMAIL,
        password: NO_CONSENT_PASSWORD,
        fullName: 'Red Team Open Redirect Consent',
      })
    })

    test.afterAll(async () => {
      await removeNoConsentUser(NO_CONSENT_EMAIL)
    })

    test('accepting consent with a protocol-relative next lands on the dashboard', async ({
      page,
      baseURL,
    }) => {
      await page.goto('/')
      await page.getByLabel('Email address').fill(NO_CONSENT_EMAIL)
      await page.getByLabel('Password', { exact: true }).fill(NO_CONSENT_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL('**/consent', { timeout: 15_000 })

      await page.goto(`/consent?next=${encodeURIComponent('//evil.example')}`)
      await page.getByRole('checkbox', { name: /terms of service/i }).check()
      await page.getByRole('checkbox', { name: /privacy policy/i }).check()
      await page.getByRole('button', { name: 'Continue' }).click()

      await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
      const url = new URL(page.url())
      expect(url.origin).toBe(new URL(baseURL ?? 'http://localhost:3000').origin)
      expect(url.pathname).toBe('/app/dashboard')
    })
  })
