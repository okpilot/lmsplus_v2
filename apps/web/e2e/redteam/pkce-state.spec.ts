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
