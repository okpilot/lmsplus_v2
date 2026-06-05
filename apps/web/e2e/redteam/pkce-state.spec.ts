/**
 * Red Team Spec 8 — Vector H (LOW): PKCE Code Forwarding
 *
 * Attack: Navigate to the auth callback URL with a forged PKCE code parameter.
 * Goal: Trick the server into exchanging a fake code for a real session token,
 *       bypassing the authentication flow entirely.
 * Defense: Supabase validates PKCE codes server-side; forged codes are rejected
 *          and the callback redirects to the login page with an error.
 *
 * This is the only red team spec that requires a real browser (Playwright page)
 * because the auth callback is handled by the Next.js route handler, not an RPC.
 */

import { expect, test } from '@playwright/test'

test.describe('Red Team: PKCE Code Forwarding', () => {
  test('rejects forged PKCE auth code and redirects away from dashboard', async ({ page }) => {
    await page.goto('/auth/callback?code=forged-invalid-code-12345')

    // The callback route redirects to the login page (/) with an error param on failure.
    // Must NOT land on /app/dashboard.
    await page.waitForURL(/[?&]error=/, { timeout: 10_000 })
    expect(page.url()).toContain('error=')
  })

  test('rejects callback with no code parameter', async ({ page }) => {
    await page.goto('/auth/callback')

    // Must redirect to the login page with error, not crash with a 500.
    await page.waitForURL(/[?&]error=/, { timeout: 10_000 })
    expect(page.url()).toContain('error=')
  })

  test('rejects callback with structurally malformed code', async ({ page }) => {
    const fakeUuid = '00000000-0000-4000-a000-000000000000'
    await page.goto(`/auth/callback?code=${fakeUuid}`)

    await page.waitForURL(/[?&]error=/, { timeout: 10_000 })
    expect(page.url()).toContain('error=')
  })

  test('does not leak session after failed PKCE exchange', async ({ page }) => {
    // After a failed exchange, verify that no authentication cookies are set
    // that would grant access to protected routes.
    await page.goto('/auth/callback?code=forged-invalid-code-12345')
    await page.waitForURL(/[?&]error=/, { timeout: 10_000 })

    // Attempt to navigate to a protected route — proxy should redirect to /
    await page.goto('/app/dashboard')

    // Must NOT stay on /app/dashboard — should redirect away
    await expect(page).not.toHaveURL(/\/app\/dashboard/)
  })
})

test.describe('Red Team: Open Redirect via `next` param (Vector X)', () => {
  /**
   * Defense under test: route.ts line 18-21 — when exchangeCodeForSession fails
   * (forged/cookieless code), the route redirects immediately to `/?error=invalid_code`
   * before the `isSafePath` / `isRecoveryRedirect` block (lines 55–83) is ever reached.
   * The `next` param is therefore unreachable on an unauthenticated callback attempt,
   * so an off-origin or non-allowlisted value cannot trigger a redirect off the app.
   * These E2E cases guard the attacker-reachable path: if a refactor moved
   * `next`-handling BEFORE the PKCE exchange, the waitForURL(/error=/) would time out
   * and the off-origin assertion would fail.
   *
   * Scope note: the success-path allowlist itself — valid code + `next` resolved against
   * ALLOWED_NEXT_PATHS, with `//evil.com` and disallowed paths falling back to
   * `/app/dashboard` — is exhaustively unit-tested in `app/auth/callback/route.test.ts`
   * (see 'blocks protocol-relative URL in next param' and 'ignores a disallowed next
   * param and redirects to /app/dashboard'). Those mock a successful exchange, which is
   * not reproducible in this E2E project without a real recovery token. The two layers
   * are complementary: unit covers the allowlist logic, E2E covers the unauthenticated
   * forged-callback path.
   *
   * Non-vacuity (code-style.md §7): each test asserts both sides —
   *   • the positive safe destination (origin matches app, pathname is '/')
   *   • the negative (origin is not evil.com / path is not the attacker-supplied value)
   */

  test('ignores ?next=https://evil.com and stays on app origin', async ({ page, baseURL }) => {
    await page.goto('/auth/callback?code=forged-invalid-code-12345&next=https://evil.com')

    // Route fails PKCE exchange (line 18-21) → redirects to /?error=invalid_code
    await page.waitForURL(/[?&]error=/, { timeout: 10_000 })

    const url = new URL(page.url())
    const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin

    // Positive: stayed on the app origin
    expect(url.origin).toBe(appOrigin)
    // Positive: landed on the default error destination (/)
    expect(url.pathname).toBe('/')
    // Negative (non-vacuous companion): did not go off-origin
    expect(url.origin).not.toContain('evil.com')
  })

  test('ignores ?next=//evil.com (protocol-relative bypass) and stays on app origin', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/auth/callback?code=forged-invalid-code-12345&next=%2F%2Fevil.com')

    // Route fails PKCE exchange (line 18-21) → redirects to /?error=invalid_code.
    // Even if the exchange had succeeded, isSafePath (line 65) rejects any path
    // starting with '//' — `extractedNext.startsWith('//')` evaluates to true.
    await page.waitForURL(/[?&]error=/, { timeout: 10_000 })

    const url = new URL(page.url())
    const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin

    // Positive: stayed on the app origin
    expect(url.origin).toBe(appOrigin)
    // Positive: landed on the default error destination (/)
    expect(url.pathname).toBe('/')
    // Negative (non-vacuous companion): did not go off-origin
    expect(url.origin).not.toContain('evil.com')
  })

  test('ignores ?next=/not-in-allowlist and stays on app origin', async ({ page, baseURL }) => {
    await page.goto('/auth/callback?code=forged-invalid-code-12345&next=%2Fnot-in-allowlist')

    // Route fails PKCE exchange (line 18-21) → redirects to /?error=invalid_code.
    // Even if the exchange had succeeded, isRecoveryRedirect (line 66) would be false
    // because '/not-in-allowlist' is not in ALLOWED_NEXT_PATHS, so the else branch
    // (line 80) would redirect to /app/dashboard — not the attacker-supplied path.
    await page.waitForURL(/[?&]error=/, { timeout: 10_000 })

    const url = new URL(page.url())
    const appOrigin = new URL(baseURL ?? 'http://localhost:3000').origin

    // Positive: stayed on the app origin
    expect(url.origin).toBe(appOrigin)
    // Positive: landed on the default error destination (/)
    expect(url.pathname).toBe('/')
    // Negative (non-vacuous companion): did not redirect to the attacker-supplied path
    expect(url.pathname).not.toBe('/not-in-allowlist')
  })
})
