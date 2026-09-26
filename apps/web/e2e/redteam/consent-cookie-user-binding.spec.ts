/**
 * Red Team Spec: Consent cookie bound to the signed-in user — Vector FU (#1377)
 *
 * Split out of consent-gate.spec.ts to stay under the test-file size cap.
 *
 * Before #1377 the `__consent` cookie value carried only the document
 * versions (`tos:privacy`), so a cookie left behind on a shared browser
 * satisfied the proxy's consent gate for ANY subsequent authenticated user —
 * not just the one who set it. The value is now `${tos}:${privacy}:${userId}`,
 * so a mismatch (wrong user, or the old two-segment format) is sent to
 * `/auth/consent-refresh`, which re-derives from DB state instead of always
 * showing /consent again.
 *
 * Closes: GitHub issue #1377.
 */

import { expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import {
  CONSENT_COOKIE,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TOS_VERSION,
} from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import { seedConsentRecords } from './helpers/seed-consent'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

test.describe('Red Team: consent cookie is bound to the signed-in user (Vector FU, #1377)', () => {
  const CONSENTED_EMAIL = 'redteam-consent-fu@lmsplus.local'
  const CONSENTED_PASSWORD = 'redteam-consent-fu-2026!'
  let consentedUserId: string
  let attackerUserId: string

  test.beforeAll(async () => {
    const admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId

    const orgId = await getEgmontOrgId(admin)
    consentedUserId = await upsertUser(admin, CONSENTED_EMAIL, CONSENTED_PASSWORD, orgId)
    await seedConsentRecords(consentedUserId)
  })

  test.afterAll(async () => {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('user_consents')
      .delete()
      .eq('user_id', consentedUserId)
      .in('document_version', [CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION])
      .select('id')
    if (error) {
      console.error('[consent-cookie-user-binding cleanup] delete failed:', error.message)
      throw new Error(`consent-cookie-user-binding cleanup failed: ${error.message}`)
    }
    if ((data?.length ?? 0) > 0) {
      console.log(`[consent-cookie-user-binding cleanup] removed ${data?.length} consent row(s)`)
    }
  })

  /**
   * A cookie one user leaves behind on a shared browser must not satisfy the
   * gate for a DIFFERENT user who signs in next. Before #1377 the cookie value
   * carried only document versions, so ANY authenticated user with that cookie
   * passed the gate. Now the value is bound to the user id, so a mismatch sends
   * the second user to /auth/consent-refresh, which finds they have never
   * consented and lands them on /consent instead of /app/dashboard.
   *
   * Single browser context throughout: user A signs in (real cookie set by
   * login-complete), signs out (client-side `supabase.auth.signOut()` clears
   * only the Supabase session cookies, never the httpOnly __consent cookie —
   * so it survives exactly as it would on a shared machine), then user B signs
   * in and immediately hits a protected route.
   */
  test('a consent cookie left by one user does not authorize a different user who has not consented', async ({
    browser,
  }) => {
    const admin = getAdminClient()

    // Non-vacuity: confirm user B (the attacker) genuinely has no consent rows
    // before the test — otherwise landing on /consent would prove nothing.
    const { data: attackerRows, error: attackerRowsErr } = await admin
      .from('user_consents')
      .select('id')
      .eq('user_id', attackerUserId)
    expect(attackerRowsErr, 'admin consent check must succeed for non-vacuity').toBeNull()
    expect(
      attackerRows?.length ?? -1,
      'user B must have zero consent rows for the cross-user negative to be meaningful',
    ).toBe(0)

    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    try {
      // User A signs in — DB consent already seeded, so login-complete sets a
      // cookie bound to A's own id and lands directly on the dashboard.
      await page.goto('/')
      await page.fill('input[type="email"]', CONSENTED_EMAIL)
      await page.fill('input[type="password"]', CONSENTED_PASSWORD)
      await page.click('button[type="submit"]')
      await page.waitForURL('/app/dashboard', { timeout: 15_000 })

      const cookiesAfterA = await context.cookies()
      const cookieLeftByA = cookiesAfterA.find((c) => c.name === CONSENT_COOKIE)
      expect(cookieLeftByA, 'user A must leave a __consent cookie behind').toBeDefined()

      // User A signs out. This is a client-side supabase.auth.signOut() call —
      // it clears the Supabase auth cookies but never touches __consent, which
      // is httpOnly and set only by the server. The cookie A left behind
      // survives on this "shared browser" exactly as it would in the wild.
      await page.getByRole('button', { name: 'Sign out' }).click()
      await page.waitForURL('/', { timeout: 15_000 })

      const cookiesAfterSignOut = await context.cookies()
      const survivingCookie = cookiesAfterSignOut.find((c) => c.name === CONSENT_COOKIE)
      expect(
        survivingCookie?.value,
        "user A's __consent cookie must survive client-side sign-out",
      ).toBe(cookieLeftByA?.value)

      // User B signs in on the SAME browser context — A's cookie is still there.
      await page.fill('input[type="email"]', ATTACKER_EMAIL)
      await page.fill('input[type="password"]', ATTACKER_PASSWORD)
      await page.click('button[type="submit"]')

      // login-complete's own DB check already sends a never-consented user to
      // /consent, so waiting for that URL alone wouldn't isolate the proxy gate.
      // Navigate directly at a protected route afterwards to exercise it too.
      await page.waitForURL(/\/(consent|app\/)/, { timeout: 15_000 })
      await page.goto('/app/dashboard')
      await page.waitForURL('/consent', { timeout: 10_000 })

      const finalUrl = new URL(page.url())
      expect(finalUrl.pathname).toBe('/consent')
      expect(finalUrl.pathname).not.toBe('/app/dashboard')
    } finally {
      await context.close()
    }
  })

  /**
   * A consented user's cookie left over from BEFORE #1377 (the old two-segment
   * `tos:privacy` format, with no user id) must not show /consent again — the
   * mismatch is silently repaired by /auth/consent-refresh, which finds the
   * DB consent still satisfied and refreshes the cookie without ever rendering
   * the consent page. Tracked via `framenavigated` so an intermediate detour
   * through /consent would be caught even though the final URL is the same.
   */
  test('a stale two-segment consent cookie is silently refreshed, not shown /consent again', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    try {
      await page.goto('/')
      await page.fill('input[type="email"]', CONSENTED_EMAIL)
      await page.fill('input[type="password"]', CONSENTED_PASSWORD)
      await page.click('button[type="submit"]')
      await page.waitForURL('/app/dashboard', { timeout: 15_000 })

      // Overwrite the (correct, user-bound) cookie login-complete just set with
      // the OLD pre-#1377 two-segment format.
      await context.addCookies([
        {
          name: CONSENT_COOKIE,
          value: `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}`,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ])

      const navigatedUrls: string[] = []
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigatedUrls.push(frame.url())
      })

      await page.goto('/app/quiz')
      await page.waitForURL('**/app/quiz', { timeout: 10_000 })

      expect(navigatedUrls.some((u) => u.includes('/consent'))).toBe(false)
      const url = new URL(page.url())
      expect(url.pathname).toBe('/app/quiz')

      // The cookie must have been refreshed to the current, user-bound format.
      const cookies = await context.cookies()
      const refreshed = cookies.find((c) => c.name === CONSENT_COOKIE)
      expect(refreshed, 'the stale cookie must be refreshed, not just tolerated').toBeDefined()
      expect(decodeURIComponent(refreshed?.value ?? '')).toBe(
        buildConsentCookieValue(consentedUserId),
      )
    } finally {
      await context.close()
    }
  })
})
