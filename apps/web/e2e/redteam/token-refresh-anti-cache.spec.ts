/**
 * Red Team Spec — Vector CK2 (#781): anti-cache headers ride a REAL token refresh.
 *
 * Attack surface: @supabase/ssr writes anti-cache headers
 * (Cache-Control / Expires / Pragma) onto the response WHENEVER it refreshes the
 * auth cookies. If those headers were dropped, a CDN/edge could cache a
 * Set-Cookie-bearing response carrying one user's freshly-minted session token
 * and replay it to another user.
 *
 * Defense (traced to source):
 *   - packages/db/src/middleware.ts `setAll(cookies, headers)` writes the
 *     anti-cache `headers` onto the pass-through `response` when a refresh fires.
 *   - apps/web/proxy.ts `forwardAntiCacheHeaders(response, target)` copies those
 *     three headers onto its SYNTHETIC exits — the redirect (`redirectWithCookies`,
 *     lines 57-65), the 403 admin-forbidden (lines 107-115), and the 503
 *     role-lookup-failure (lines 98-104) — which are fresh NextResponse objects
 *     that would otherwise lose them.
 *
 * Strict vs. soft exits (confirmed by a local run, 2026-06-06):
 *   - SYNTHETIC exits (redirect / 403 / 503): proxy.ts builds these by hand and
 *     forwards the SSR `no-store` directive verbatim, so they reliably carry the
 *     full anti-cache triple (cache-control: no-store, expires, pragma). These
 *     are asserted STRICTLY below (redirect + 403).
 *   - ROUTED pass-through (200 /app/*): proxy.ts returns the middleware
 *     `response` (NextResponse.next()), but Next.js then OVERRIDES cache-control
 *     on the routed page with the dynamic page's own directive
 *     (`no-cache, must-revalidate`), so the middleware's `no-store` is lost. This
 *     is a Next.js framework behaviour, not a defense bug — the hard `no-store`
 *     guarantee lives on the synthetic exits. The pass-through is therefore
 *     asserted SOFTLY (cache-control still forbids unconditioned caching).
 *
 * The headers only appear WHEN A REFRESH HAPPENED. proxy.test.ts unit-tests the
 * forwarding with a mocked response that already has the headers set; it cannot
 * prove a real refresh produces them through the live SSR client. This E2E does:
 * it signs in for real, sabotages the stored session's `expires_at` via the
 * forceTokenRefresh seam, then asserts the headers are present on a response that
 * provably carried a refresh.
 *
 * Non-vacuity (two independent guards per exit, enforced on ALL THREE):
 *   1. The response carries a fresh `sb-*-auth-token` Set-Cookie.
 *   2. The session in the cookie jar afterwards has a FUTURE `expires_at`
 *      (we sabotaged it to the past; only a real server-side refresh restores
 *      a future expiry). This is immune to same-second JWT byte-equality.
 * If no refresh occurred, both guards fail loudly — the header assertions never
 * pass vacuously.
 *
 * Covers acceptance: two strict synthetic exits (/ → 302 /app/dashboard and a
 * 403 on /app/admin/*) plus the routed pass-through exit (/app/* 200, soft).
 */

import { type APIResponse, type BrowserContext, expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TOS_VERSION,
} from '../../lib/consent/versions'
import { forceTokenRefresh, readAuthSession } from './helpers/force-token-refresh'
import { seedRedTeamStudent, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const ANTI_CACHE_HEADERS = ['cache-control', 'expires', 'pragma'] as const
const AUTH_TOKEN_COOKIE_RE = /^sb-.+-auth-token(?:\.\d+)?$/

/** Names of the cookies a Set-Cookie response is trying to write. */
function setCookieNames(setCookieValues: string[]): string[] {
  return setCookieValues.map((raw) => raw.split('=', 1)[0]?.trim() ?? '')
}

/** Assert the response actually wrote a fresh auth-token cookie (a real refresh). */
function assertRefreshSetCookie(setCookieValues: string[], label: string): void {
  const names = setCookieNames(setCookieValues)
  const refreshed = names.some((name) => AUTH_TOKEN_COOKIE_RE.test(name))
  expect(
    refreshed,
    `${label}: expected a fresh sb-*-auth-token Set-Cookie (proves a real token refresh occurred); got cookies: ${names.join(', ') || '(none)'}`,
  ).toBe(true)
}

/** Collect all Set-Cookie header values (Playwright keeps them separate in headersArray). */
function getSetCookies(headersArray: Array<{ name: string; value: string }>): string[] {
  return headersArray.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
}

/**
 * STRICT anti-cache assertion for SYNTHETIC proxy exits (redirect / 403 / 503).
 * proxy.ts builds these responses by hand via forwardAntiCacheHeaders, so the
 * full SSR triple (cache-control: no-store, expires, pragma) survives verbatim.
 */
function assertAntiCacheHeaders(headers: Record<string, string>, label: string): void {
  for (const name of ANTI_CACHE_HEADERS) {
    expect(headers[name], `${label}: missing anti-cache header "${name}"`).toBeTruthy()
  }
  // The SSR client emits a no-store cache directive; assert the substring so the
  // check survives minor directive-ordering differences across versions.
  expect(headers['cache-control'], `${label}: cache-control must forbid storage`).toContain(
    'no-store',
  )
}

/**
 * SOFT anti-cache assertion for the ROUTED (200) pass-through exit.
 *
 * Next.js governs cache-control on ROUTED responses and overrides the
 * middleware's `no-store` with the page's own directive (observed locally:
 * `no-cache, must-revalidate`); the hard anti-cache guarantee (`no-store`) is on
 * the synthetic redirect/403/503 exits via forwardAntiCacheHeaders. Here we
 * assert only what the framework lets survive: the routed page still forbids
 * serving an unconditioned cached copy (`no-store` OR `no-cache`). The
 * `expires`/`pragma` headers are NOT asserted — Next.js does not re-emit them on
 * routed responses, so requiring them would make the test fail on a correct app.
 * The refresh non-vacuity guards (fresh Set-Cookie + restored future expiry)
 * still prove the refresh genuinely fired on this request.
 */
function assertRoutedForbidsUnconditionedCache(
  headers: Record<string, string>,
  label: string,
): void {
  expect(
    headers['cache-control'] ?? '',
    `${label}: routed cache-control must forbid unconditioned caching (no-store or no-cache)`,
  ).toMatch(/no-store|no-cache/i)
}

/**
 * Force a real token refresh, fetch `path` (no auto-redirect), and prove the
 * response provably carried a refresh via the two non-vacuity guards. Returns
 * the response so the caller can assert status + the exit-specific cache posture.
 */
async function fetchWithForcedRefresh(
  context: BrowserContext,
  path: string,
  label: string,
): Promise<APIResponse> {
  await forceTokenRefresh(context)
  const before = await readAuthSession(context)
  expect(
    before?.expiresAt,
    `${label}: precondition — forceTokenRefresh sabotaged expires_at into the past`,
  ).toBeLessThan(Math.floor(Date.now() / 1000))

  const res = await context.request.fetch(path, { maxRedirects: 0 })

  // Non-vacuity guard 1: the response carried a fresh auth-token Set-Cookie.
  assertRefreshSetCookie(getSetCookies(res.headersArray()), label)
  // Non-vacuity guard 2: the jar's session now has a future expiry (refresh ran).
  const after = await readAuthSession(context)
  expect(
    after?.expiresAt,
    `${label}: a real refresh must restore a future-dated session`,
  ).toBeGreaterThan(Math.floor(Date.now() / 1000))

  return res
}

test.describe('Red Team: CK2 — anti-cache headers on a real token refresh', () => {
  test.beforeAll(async () => {
    // Idempotent: ensure the egmont victim student exists with known creds.
    await seedRedTeamStudent()
  })

  test('synthetic exits (redirect + 403) carry no-store, routed pass-through forbids caching, all after a real refresh', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    try {
      // Sign in through the real login page so @supabase/ssr sets its session
      // cookies in this context (same pattern as header-validation.spec.ts).
      await page.goto('/')
      await page.getByLabel('Email address').fill(VICTIM_EMAIL)
      await page.getByLabel('Password', { exact: true }).fill(VICTIM_PASSWORD)
      await Promise.all([
        page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
        page.getByRole('button', { name: 'Sign in' }).click(),
      ])

      // Inject the consent cookie so the proxy consent gate passes and the
      // pass-through request reaches the /app/* page as a 200 (not a /consent
      // redirect). Mirrors proxy.ts: `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}`.
      await context.addCookies([
        {
          name: CONSENT_COOKIE,
          value: `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}`,
          url: BASE_URL,
        },
      ])

      // ---- Strict synthetic exit 1: authenticated `/` → 3xx to /app/dashboard ----
      // proxy.ts builds this redirect by hand (redirectWithCookies, lines 57-65)
      // and forwards the SSR no-store directive verbatim.
      const redirectRes = await fetchWithForcedRefresh(context, '/', 'redirect exit')
      expect(redirectRes.status(), 'authenticated / should redirect (3xx)').toBeGreaterThanOrEqual(
        300,
      )
      expect(redirectRes.status(), 'authenticated / should redirect (3xx)').toBeLessThan(400)
      expect(
        new URL(redirectRes.headers().location ?? '', BASE_URL).pathname,
        'authenticated / should redirect to the dashboard',
      ).toBe('/app/dashboard')
      assertAntiCacheHeaders(redirectRes.headers(), 'redirect exit (302 → /app/dashboard)')

      // ---- Strict synthetic exit 2: non-admin student → 403 on /app/admin/* ----
      // The victim is a `student`, so proxy.ts returns a hand-built 403
      // (lines 107-115) once the consent gate (added above) is satisfied. This is
      // the second guaranteed forwardAntiCacheHeaders path.
      const forbiddenRes = await fetchWithForcedRefresh(
        context,
        '/app/admin/students',
        '403 admin-forbidden exit',
      )
      expect(
        forbiddenRes.status(),
        'non-admin student on /app/admin/* should be forbidden (403)',
      ).toBe(403)
      assertAntiCacheHeaders(
        forbiddenRes.headers(),
        '403 admin-forbidden exit (/app/admin/students)',
      )

      // ---- Soft routed exit: authenticated + consented /app/dashboard → 200 ----
      // Next.js overrides cache-control on routed pages, so this is asserted softly
      // (see assertRoutedForbidsUnconditionedCache); the refresh non-vacuity guards
      // inside fetchWithForcedRefresh still prove the refresh fired.
      const passRes = await fetchWithForcedRefresh(context, '/app/dashboard', 'pass-through exit')
      expect(
        passRes.status(),
        'authenticated + consented /app/dashboard should pass through as 200',
      ).toBe(200)
      assertRoutedForbidsUnconditionedCache(
        passRes.headers(),
        'pass-through exit (200 /app/dashboard)',
      )
    } finally {
      await context.close()
    }
  })
})
