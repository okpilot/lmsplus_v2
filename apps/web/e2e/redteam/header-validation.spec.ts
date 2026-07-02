/**
 * Red Team Spec — OWASP A02 Security Misconfiguration: Response Headers
 *
 * Attack surface: A misconfigured or missing security header (CSP, HSTS,
 * X-Frame-Options, etc.) lets an attacker frame the app, downgrade
 * connections, or run injected scripts.
 *
 * Defense: `apps/web/next.config.ts` declares 7 security headers under a
 * catch-all `source: '/(.*)'` rule. This spec verifies the response actually
 * carries them on representative pre-auth, post-redirect, and unauth-redirect
 * paths. Closes part of issue #108.
 *
 * Extended (issue #637): adds the 403 middleware response class. The proxy
 * emits a 403 (not a 3xx) when an authenticated non-admin student hits
 * /app/admin/*. next.config.ts `headers()` does NOT apply to non-routed
 * middleware responses — proxy.ts must call applySecurityHeaders() on the
 * NextResponse it returns. This test verifies that branch is exercised.
 *
 * proxy.ts line 93-99 (403 branch):
 *   if (profile?.role !== 'admin') {
 *     const forbidden = new NextResponse('Forbidden', { status: 403 })
 *     ...
 *     applySecurityHeaders(forbidden)   ← the branch under test
 *     return forbidden
 *   }
 *
 * 503 path (Supabase profile-lookup failure): skipped — no test-only seam
 * exists to force profileError without production changes (issue #637).
 */

import { expect, test } from '@playwright/test'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

// Two response classes carry different CSPs:
// - Routed responses (`/`, `/auth/login`): full CSP from next.config.ts —
//   default-src 'self', supabase.co connect-src, etc.
// - Edge-Middleware redirects (`/app/dashboard` for unauth users): minimal
//   hardened CSP set by proxy.ts — default-src 'none'; frame-ancestors 'none'.
//   No scripts execute on a 3xx, so `default-src 'none'` is correct here.
const PATHS = [
  { name: 'root', path: '/', responseClass: 'routed' },
  { name: 'dashboard (unauth → redirect)', path: '/app/dashboard', responseClass: 'redirect' },
  { name: 'login', path: '/auth/login', responseClass: 'routed' },
] as const

const EXACT_HEADERS = [
  { key: 'x-dns-prefetch-control', expected: 'on' },
  { key: 'x-frame-options', expected: 'DENY' },
  { key: 'x-content-type-options', expected: 'nosniff' },
  { key: 'referrer-policy', expected: 'strict-origin-when-cross-origin' },
  { key: 'permissions-policy', expected: 'camera=(), microphone=(), geolocation=()' },
] as const

const HSTS_MIN_MAX_AGE = 15_768_000 // 6 months

/** Assert all 7 security headers on a Response object. */
function assertSecurityHeaders(
  headers: Record<string, string>,
  path: string,
  cspClass: 'routed' | 'redirect' | 'middleware-error',
): void {
  for (const { key, expected } of EXACT_HEADERS) {
    expect(headers[key], `missing or wrong ${key} on ${path}`).toBe(expected)
  }

  // HSTS — must be present with max-age ≥ 6 months.
  const hsts = headers['strict-transport-security']
  expect(hsts, `missing HSTS on ${path}`).toBeTruthy()
  const maxAgeMatch = hsts?.match(/max-age=(\d+)/)
  expect(maxAgeMatch, `HSTS missing max-age on ${path}`).not.toBeNull()
  expect(Number(maxAgeMatch?.[1] ?? 0), `HSTS max-age too short on ${path}`).toBeGreaterThanOrEqual(
    HSTS_MIN_MAX_AGE,
  )

  // CSP — present on every response; directive set differs by class.
  // frame-ancestors 'none' must be on all classes.
  const csp = headers['content-security-policy']
  expect(csp, `missing CSP on ${path}`).toBeTruthy()
  expect(csp).toContain("frame-ancestors 'none'")

  if (cspClass === 'routed') {
    // Full CSP from next.config.ts — env-dependent allowances vary
    // (dev injects 'unsafe-eval', local-supabase injects localhost),
    // so only assert the env-stable structural pieces.
    expect(csp).toContain("default-src 'self'")
    expect(csp).toMatch(/script-src 'self'/)
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.supabase\.co/)
    expect(csp).toContain("worker-src 'self' blob:")
  } else {
    // Minimal hardened CSP set by proxy.ts (redirects + 4xx/5xx).
    // No scripts execute on a 3xx/4xx/5xx, so default-src 'none' is correct.
    // Exact equality — catches regressions that add 'unsafe-inline' or similar.
    expect(csp, `CSP on ${path} must be exactly the reduced proxy.ts value`).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    )
  }
}

test.describe('Red Team: OWASP A02 — security response headers', () => {
  for (const { name, path, responseClass } of PATHS) {
    test(`${name} response carries all required security headers`, async ({ request }) => {
      // maxRedirects: 0 — assert headers on the FIRST response, including 3xx
      // redirects from middleware (e.g. unauth /app/* → /auth/login).
      const response = await request.fetch(path, { maxRedirects: 0 })
      expect(response.status(), `unexpected response for ${path}`).toBeLessThan(500)

      assertSecurityHeaders(response.headers(), path, responseClass)
    })
  }

  // ---------------------------------------------------------------------------
  // 403 branch: authenticated non-admin student accessing /app/admin/*
  //
  // proxy.ts lines 74-100:
  //   isAdminRoute = pathname === '/app/admin' || pathname.startsWith('/app/admin/')
  //   if (isAdminRoute && user) {
  //     ... look up profile.role ...
  //     if (profile?.role !== 'admin') {
  //       const forbidden = new NextResponse('Forbidden', { status: 403 })
  //       applySecurityHeaders(forbidden)   ← branch under test
  //       return forbidden
  //     }
  //   }
  //
  // Non-vacuous: assert status === 403 first (proves the 403 branch fired, not
  // a redirect or a different path). A 302 redirect here would mean the user
  // was not authenticated (wrong branch); a 200 would mean admin was granted.
  // ---------------------------------------------------------------------------
  test('authenticated non-admin student hitting /app/admin/* receives 403 with all required security headers', async ({
    browser,
  }) => {
    // Seed the ATTACKER student (role='student') so the proxy's admin-role check
    // returns role !== 'admin' and emits a 403. seedRedTeamUsers is idempotent.
    await seedRedTeamUsers()

    // Create a fresh browser context (no saved auth state — redteam project has
    // no dependencies). Log in via the sign-in page to obtain Supabase session
    // cookies in this context.
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    try {
      // Sign in as the ATTACKER student through the real login page so
      // @supabase/ssr sets its session cookies in this context.
      await page.goto('/')
      await page.getByLabel('Email address').fill(ATTACKER_EMAIL)
      await page.getByLabel('Password', { exact: true }).fill(ATTACKER_PASSWORD)
      // Race-safe: resolve only on a real post-login path (consent or dashboard).
      // Removing `|$` prevents the wait resolving on the pre-submit `/` itself.
      await Promise.all([
        page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
        page.getByRole('button', { name: 'Sign in' }).click(),
      ])

      // Inject the consent cookie so the proxy's consent gate passes and the
      // request reaches the admin-role check. The cookie value mirrors what
      // proxy.ts constructs: `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}`
      // (lib/consent/versions.ts — currently 'v1.0:v1.0').
      await context.addCookies([
        {
          name: '__consent',
          value: 'v1.0:v1.0',
          url: 'http://localhost:3000',
        },
      ])

      // Use context.request (carries the session + consent cookies) with
      // maxRedirects: 0 so we assert the raw response from the proxy,
      // not a page the browser settled on after following all redirects.
      const response = await context.request.fetch('/app/admin/students', {
        maxRedirects: 0,
      })

      // Non-vacuity: status MUST be 403 — proves we entered the 403 branch.
      // 302 → user not seen as authenticated (wrong path).
      // 200 → student was incorrectly granted admin access (privilege escalation).
      expect(
        response.status(),
        'expected 403 Forbidden from proxy admin-role check; got a different status — verify ATTACKER_EMAIL has role=student',
      ).toBe(403)

      // All 7 security headers must be present on the 403 response.
      // proxy.ts applySecurityHeaders() is called on the NextResponse object
      // before it is returned (line 98), so the headers must arrive here.
      assertSecurityHeaders(response.headers(), '/app/admin/students', 'middleware-error')
    } finally {
      await context.close()
    }
  })
})
