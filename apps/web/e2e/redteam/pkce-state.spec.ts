/**
 * Red Team Spec 8 — Vector H (LOW): PKCE Code Forwarding
 *
 * Attack: Navigate to the auth callback URL with a forged PKCE code parameter.
 * Goal: Trick the server into exchanging a fake code for a real session token,
 *       bypassing the authentication flow entirely.
 * Defense: Supabase validates PKCE codes server-side; forged codes are rejected
 *           and the callback redirects to the login page.
 *
 * This is the only red team spec that requires a real browser (Playwright page)
 * because the auth callback is handled by the Next.js route handler, not an RPC.
 */

import { expect, test } from '@playwright/test'

test.describe('Red Team: PKCE Code Forwarding', () => {
  test('rejects forged PKCE auth code and redirects to login', async ({ page }) => {
    // Navigate to the auth callback with a fabricated code value.
    // A real PKCE code is a short-lived, single-use token tied to a code verifier
    // stored in the browser. A forged code has no matching verifier and no record
    // in Supabase, so the exchange must fail.
    await page.goto('/auth/callback?code=forged-invalid-code-12345')

    // The callback route must redirect to the login page, not the dashboard.
    await page.waitForURL('**/login*', { timeout: 10_000 })

    // Verify the user lands on the login page (not the app).
    await expect(page.getByText(/sign in|log in|login/i)).toBeVisible()
  })

  test('rejects callback with no code parameter', async ({ page }) => {
    // A callback with no code at all (e.g., direct navigation) must not
    // create a session. This also covers confused-deputy attacks where an
    // adversary sends the victim a callback URL without a valid code.
    await page.goto('/auth/callback')

    // Must redirect to login, not crash with a 500.
    await page.waitForURL('**/login*', { timeout: 10_000 })
    await expect(page.getByText(/sign in|log in|login/i)).toBeVisible()
  })

  test('rejects callback with structurally malformed code', async ({ page }) => {
    // Try a code that looks like a valid UUID to probe length/format checks.
    const fakeUuid = '00000000-0000-0000-0000-000000000000'
    await page.goto(`/auth/callback?code=${fakeUuid}`)

    await page.waitForURL('**/login*', { timeout: 10_000 })
    await expect(page.getByText(/sign in|log in|login/i)).toBeVisible()
  })

  test('does not leak session after failed PKCE exchange', async ({ page }) => {
    // After a failed exchange, verify that no authentication cookies are set
    // that would grant access to protected routes.
    await page.goto('/auth/callback?code=forged-invalid-code-12345')
    await page.waitForURL('**/login*', { timeout: 10_000 })

    // Attempt to navigate to a protected route — should redirect back to login.
    await page.goto('/app/dashboard')
    await page.waitForURL('**/login*', { timeout: 10_000 })
    await expect(page.getByText(/sign in|log in|login/i)).toBeVisible()
  })
})
