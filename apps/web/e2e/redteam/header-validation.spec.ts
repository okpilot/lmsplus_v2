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
 * Extended (issue #637): the admin-route response class. The
 * proxy no longer reads `users` on /app/admin/*; the admin role check is
 * `requireAdmin()` in `app/app/admin/layout.tsx` and in every admin page. A
 * non-admin student therefore receives a ROUTED 200 (full next.config.ts
 * headers) whose body carries no admin markup, and the browser is then sent to
 * /app/dashboard by the client-side redirect `requireAdmin()` emits.
 */

import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

// Two response classes carry different CSPs:
// - Routed responses (`/`, `/auth/forgot-password`): full CSP from next.config.ts —
//   default-src 'self', supabase.co connect-src, etc.
// - Edge-Middleware redirects (`/app/dashboard` for unauth users): minimal
//   hardened CSP set by proxy.ts — default-src 'none'; frame-ancestors 'none'.
//   No scripts execute on a 3xx, so `default-src 'none'` is correct here.
const PATHS = [
  { name: 'root', path: '/', responseClass: 'routed' },
  { name: 'dashboard (unauth → redirect)', path: '/app/dashboard', responseClass: 'redirect' },
  // Was `/auth/login`, which is not a route at all — there is no `login/` directory
  // under `app/auth/` — so that entry exercised a 404 rather than the routed auth
  // page it named. `/` is the real login page, already covered above as `root`.
  { name: 'forgot password', path: '/auth/forgot-password', responseClass: 'routed' },
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
  cspClass: 'routed' | 'redirect',
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
    // Minimal hardened CSP set by proxy.ts (redirects + 5xx).
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
      // redirects from middleware (e.g. unauth /app/* → /).
      const response = await request.fetch(path, { maxRedirects: 0 })
      expect(response.status(), `unexpected response for ${path}`).toBeLessThan(500)
      // A Next 404 is <500 AND still receives the next.config.ts `/(.*)` headers,
      // so status alone cannot tell a routed page from a missing one — which is how
      // the old `/auth/login` entry passed for months while pointing at no route.
      if (responseClass === 'routed') {
        expect(response.status(), `${path} is not a routed page`).toBe(200)
      }

      assertSecurityHeaders(response.headers(), path, responseClass)
    })
  }

  // ---------------------------------------------------------------------------
  // Admin route, authenticated non-admin student: /app/admin/*
  //
  // The proxy passes the request through; requireAdmin() in the admin layout and
  // page redirects. Non-vacuous: the admin's fetch of the SAME path must contain
  // the admin heading, so "absent for the student" proves the gate withheld it,
  // not that the page never renders that text. A 3xx here would mean a different
  // layer fired (proxy auth/consent gate), a 200 containing the heading would
  // mean the student received admin markup.
  // ---------------------------------------------------------------------------
  const ADMIN_MARKER = 'Student Management'

  async function signInWithConsent(
    browser: Browser,
    credentials: { email: string; password: string; userId: string },
  ): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    await page.goto('/')
    await page.getByLabel('Email address').fill(credentials.email)
    await page.getByLabel('Password', { exact: true }).fill(credentials.password)
    await Promise.all([
      page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ])
    // Mirrors checkConsentGate: buildConsentCookieValue(user.id), bound to this user (#1377).
    await context.addCookies([
      {
        name: CONSENT_COOKIE,
        value: buildConsentCookieValue(credentials.userId),
        url: 'http://localhost:3000',
      },
    ])
    return { context, page }
  }

  test('authenticated non-admin student hitting /app/admin/* gets no admin markup and lands on the dashboard', async ({
    browser,
  }) => {
    const { attackerUserId } = await seedRedTeamUsers()
    const { adminUserId } = await seedRedTeamAdmin()

    const adminSession = await signInWithConsent(browser, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      userId: adminUserId,
    })
    const studentSession = await signInWithConsent(browser, {
      email: ATTACKER_EMAIL,
      password: ATTACKER_PASSWORD,
      userId: attackerUserId,
    })

    try {
      // Positive control: the admin receives the heading from the same path.
      const adminResponse = await adminSession.context.request.fetch('/app/admin/students', {
        maxRedirects: 0,
        timeout: 60_000,
      })
      expect(adminResponse.status(), 'admin control fetch must be a routed 200').toBe(200)
      expect(await adminResponse.text(), 'control: admin markup must be present').toContain(
        ADMIN_MARKER,
      )

      const response = await studentSession.context.request.fetch('/app/admin/students', {
        maxRedirects: 0,
        timeout: 60_000,
      })
      expect(
        response.status(),
        'the proxy must pass the student through (200); a 3xx means another proxy gate fired',
      ).toBe(200)
      expect(await response.text(), 'student must not receive admin markup').not.toContain(
        ADMIN_MARKER,
      )
      assertSecurityHeaders(response.headers(), '/app/admin/students', 'routed')

      await studentSession.page.goto('/app/admin/students', { timeout: 60_000 })
      await expect(studentSession.page).toHaveURL(/\/app\/dashboard$/, { timeout: 15_000 })
    } finally {
      await adminSession.context.close()
      await studentSession.context.close()
    }
  })
})
