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
 */

import { expect, test } from '@playwright/test'

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

test.describe('Red Team: OWASP A02 — security response headers', () => {
  for (const { name, path, responseClass } of PATHS) {
    test(`${name} response carries all required security headers`, async ({ request }) => {
      // maxRedirects: 0 — assert headers on the FIRST response, including 3xx
      // redirects from middleware (e.g. unauth /app/* → /auth/login).
      const response = await request.fetch(path, { maxRedirects: 0 })
      expect(response.status(), `unexpected response for ${path}`).toBeLessThan(500)

      const headers = response.headers()

      for (const { key, expected } of EXACT_HEADERS) {
        expect(headers[key], `missing or wrong ${key} on ${path}`).toBe(expected)
      }

      // HSTS — must be present with max-age ≥ 6 months.
      const hsts = headers['strict-transport-security']
      expect(hsts, `missing HSTS on ${path}`).toBeTruthy()
      const maxAgeMatch = hsts?.match(/max-age=(\d+)/)
      expect(maxAgeMatch, `HSTS missing max-age on ${path}`).not.toBeNull()
      expect(
        Number(maxAgeMatch?.[1] ?? 0),
        `HSTS max-age too short on ${path}`,
      ).toBeGreaterThanOrEqual(HSTS_MIN_MAX_AGE)

      // CSP — present on every response, but the directive set differs by
      // class. frame-ancestors 'none' must be on both because that's the
      // single policy directive that applies to a 3xx browser preview.
      const csp = headers['content-security-policy']
      expect(csp, `missing CSP on ${path}`).toBeTruthy()
      expect(csp).toContain("frame-ancestors 'none'")

      if (responseClass === 'routed') {
        // Full CSP from next.config.ts — env-dependent allowances vary
        // (dev injects 'unsafe-eval', local-supabase injects localhost),
        // so only assert the env-stable structural pieces.
        expect(csp).toContain("default-src 'self'")
        expect(csp).toMatch(/script-src 'self'/)
        expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.supabase\.co/)
        expect(csp).toContain("worker-src 'self' blob:")
      } else {
        // Minimal hardened CSP set by proxy.ts redirectWithCookies. No
        // scripts execute on a 3xx, so default-src 'none' is correct.
        expect(csp).toContain("default-src 'none'")
      }
    })
  }
})
