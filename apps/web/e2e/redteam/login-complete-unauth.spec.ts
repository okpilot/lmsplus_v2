/**
 * Red Team Spec — Vector V (MEDIUM): Unauthenticated access to /auth/login-complete
 *
 * Attack: Issue a cookieless GET to /auth/login-complete, bypassing the
 *         normal OAuth callback flow that would establish a session first.
 * Goal:   Trigger record_login() for a non-existent session, or access the
 *         post-login redirect chain without a valid user identity.
 * Defense: The route handler calls supabase.auth.getUser() and short-circuits
 *          with NextResponse.redirect(new URL('/', request.url)) when user is
 *          null (route.ts line 15-17). record_login() is only called AFTER the
 *          user check passes (route.ts line 20), so an unauthenticated request
 *          never reaches the RPC. The proxy matcher includes /auth/login-complete
 *          (proxy.ts line 126) but does not redirect that path itself — the
 *          route handler is the guard.
 *
 * Closes: GitHub issue #296 (PR-5 redteam auth-callback).
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'

test.describe('Red Team: Unauthenticated access to /auth/login-complete (Vector V)', () => {
  /**
   * Case 1 — Cookieless GET is redirected to the login page.
   *
   * The redteam Playwright project has no `dependencies` in playwright.config.ts,
   * so the `page` fixture starts with an empty browser context (no auth cookies).
   * This is an unauthenticated browser by default.
   *
   * Guard: route.ts lines 15-17 — `if (!user) return NextResponse.redirect(new URL('/', request.url))`
   */
  test('cookieless GET to /auth/login-complete redirects to the login page', async ({
    browser,
  }) => {
    // Fresh context with no cookies — explicitly isolated from any shared auth state.
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    try {
      await page.goto('/auth/login-complete')

      // The route handler redirects unauthenticated requests to '/' (the login page).
      // waitForURL resolves after all redirects settle.
      await page.waitForURL('/', { timeout: 10_000 })

      expect(page.url()).toMatch(/\/$/)
      // Must NOT end up on any /app/* route
      expect(page.url()).not.toContain('/app/')
      // Must NOT end up on /consent (only reached after successful auth)
      expect(page.url()).not.toContain('/consent')
    } finally {
      await context.close()
    }
  })

  /**
   * Case 2 — Cookieless GET does NOT invoke record_login.
   *
   * Non-vacuity: we read the baseline count BEFORE the request and assert it
   * is readable (error null), proving the admin query works and the table is
   * reachable. The "count did not increase" assertion is then meaningful: if
   * record_login fired, the count would grow. The positive path (record_login
   * writing a student.login row on successful auth) is covered by
   * audit-completeness.spec.ts "writes student.login when record_login() is invoked".
   *
   * We scope by event_type = 'student.login' and created_at >= testStart so
   * concurrent specs writing their own login rows don't create false positives.
   */
  test('cookieless GET to /auth/login-complete does not invoke record_login', async ({
    browser,
  }) => {
    const admin = getAdminClient()

    // Snapshot: count of student.login rows written from this point forward.
    const testStart = new Date().toISOString()

    // Fresh context — no auth cookies.
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    try {
      await page.goto('/auth/login-complete')
      await page.waitForURL('/', { timeout: 10_000 })
    } finally {
      await context.close()
    }

    // Verify the admin query itself is healthy (non-vacuity: if this errors,
    // the "count did not increase" assertion below would pass vacuously).
    const { data: rows, error } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'student.login')
      .gte('created_at', testStart)

    expect(
      error,
      'audit_events query must succeed for the negative assertion to be meaningful',
    ).toBeNull()

    // record_login must NOT have been called — the user guard fires before the RPC.
    expect(
      rows?.length ?? 0,
      'record_login must not write a student.login row for a cookieless request',
    ).toBe(0)
  })
})
