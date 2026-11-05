/**
 * Red Team Spec — Vector KW (#1132): `x-middleware-subrequest` against the proxy auth gate.
 *
 * CVE-2025-29927 let a client skip Next middleware by sending `x-middleware-subrequest`.
 * The installed Next (16.x) has no reference to that header (`grep -rl middleware-subrequest
 * node_modules/next/dist` finds none), so this pins the CURRENT protection and guards against the
 * mechanism returning: apps/web/proxy.ts redirects an unauthenticated `/app/*` request to `/`
 * (matcher `/app/:path*`).
 *
 * Attack: unauthenticated GET /app/dashboard (maxRedirects 0) carrying the header with each of
 * the values the CVE advisories used: `middleware`, `src/middleware`, `proxy`, and the
 * five-times-repeated `middleware:middleware:middleware:middleware:middleware`.
 * Each must answer 307 to `/` — never 200, never page markup.
 *
 * CONTROL: the same request WITHOUT the header is also redirected (baseline), and a signed-in
 * student (consent cookie present) receives 200 on the same path with the header and without it,
 * so the redirects are the gate and not a broken route.
 *
 * Admin gating is `requireAdmin()` in the pages, not the proxy (Vector IL covers it).
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'
import { signInViaForm } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const SKIP_HEADER = 'x-middleware-subrequest'
const HEADER_VALUES = [
  'middleware',
  'src/middleware',
  'proxy',
  'middleware:middleware:middleware:middleware:middleware',
]

async function dashboardStatus(ctx: BrowserContext, headers: Record<string, string>) {
  const res = await ctx.request.get(`${BASE_URL}/app/dashboard`, { maxRedirects: 0, headers })
  const location = res.headers().location ?? ''
  return {
    status: res.status(),
    path: location ? new URL(location, BASE_URL).pathname : '',
    markup: res.status() === 200 ? await res.text() : '',
  }
}

test.describe('Red Team: proxy skip header (KW)', () => {
  test.setTimeout(90_000)

  test('KW: x-middleware-subrequest does not bypass the proxy auth gate', async ({ browser }) => {
    const { attackerUserId } = await seedRedTeamUsers()
    const anon = await browser.newContext({ storageState: undefined })
    const signedIn = await browser.newContext({ storageState: undefined })
    try {
      // Baseline: no header, no cookies.
      expect(await dashboardStatus(anon, {})).toEqual({ status: 307, path: '/', markup: '' })

      for (const value of HEADER_VALUES) {
        const res = await dashboardStatus(anon, { [SKIP_HEADER]: value })
        expect(res, `header value ${value}`).toEqual({ status: 307, path: '/', markup: '' })
      }

      // CONTROL: a real session reaches the page, with and without the header.
      await signedIn.addCookies([
        { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerUserId), url: BASE_URL },
      ])
      const page = await signedIn.newPage()
      await signInViaForm(page, { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD })
      await page.close()
      for (const headers of [{}, { [SKIP_HEADER]: HEADER_VALUES[0] as string }]) {
        const res = await dashboardStatus(signedIn, headers)
        expect(res.status, JSON.stringify(headers)).toBe(200)
        expect(res.markup.length).toBeGreaterThan(0)
      }
    } finally {
      await anon.close()
      await signedIn.close()
    }
  })
})
