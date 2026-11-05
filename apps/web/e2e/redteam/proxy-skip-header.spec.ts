/**
 * Red Team Spec — Vector KW (#1132): `x-middleware-subrequest` against the proxy auth gate.
 *
 * CVE-2025-29927 let a client skip Next middleware by sending `x-middleware-subrequest`.
 * The installed Next (16.x) has no reference to that header (`grep -rl middleware-subrequest
 * node_modules/next/dist` finds none), so this pins the CURRENT protection and guards against the
 * mechanism returning: apps/web/proxy.ts redirects an unauthenticated `/app/*` request to
 * `/?next=<path>` (matcher `/app/:path*`).
 *
 * Attack: unauthenticated GET /app/settings and /app/admin/students (maxRedirects 0) carrying
 * the header with each of the values the CVE advisories used: `middleware`, `src/middleware`, `proxy`, `src/proxy`, and the
 * five-times-repeated `middleware:...` and `proxy:...` forms.
 * Each must answer 307 to `/?next=<that path>` — never 200, never page markup. `/app/dashboard`
 * (#1132 AC1) is not used: `safeNextPath` drops that default destination, so the proxy redirect is
 * indistinguishable from `requireAuthUser`'s bare `/` redirect. Only the proxy
 * adds `?next=` (`withNext`); `requireAuthUser` also redirects to a bare `/`, so asserting `next`
 * is what fails if the proxy were bypassed.
 *
 * CONTROL: the same request WITHOUT the header is also redirected (baseline), and a signed-in
 * user (consent cookie present) receives 200 on the same path with the header and without it
 * (attacker student on /app/settings, red-team admin on /app/admin/students), so the redirects
 * are the gate and not a broken route.
 *
 * Admin gating is `requireAdmin()` in the pages, not the proxy (Vector IL covers it).
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
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
import { signInViaForm } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const SKIP_HEADER = 'x-middleware-subrequest'
const HEADER_VALUES = [
  'middleware',
  'src/middleware',
  'proxy',
  'src/proxy',
  'middleware:middleware:middleware:middleware:middleware',
  'proxy:proxy:proxy:proxy:proxy',
]

const SETTINGS = { path: '/app/settings', marker: 'Export My Data' }
const ADMIN_STUDENTS = { path: '/app/admin/students', marker: 'Student Management' }
const TARGETS = [SETTINGS, ADMIN_STUDENTS]

async function appPageStatus(ctx: BrowserContext, path: string, headers: Record<string, string>) {
  const res = await ctx.request.get(`${BASE_URL}${path}`, { maxRedirects: 0, headers })
  const location = res.headers().location ?? ''
  const url = location ? new URL(location, BASE_URL) : null
  return {
    status: res.status(),
    path: url?.pathname ?? '',
    next: url?.searchParams.get('next') ?? '',
    markup: res.status() === 200 ? await res.text() : '',
  }
}

async function signInWithConsent(
  ctx: BrowserContext,
  email: string,
  password: string,
  userId: string,
) {
  await ctx.addCookies([
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(userId), url: BASE_URL },
  ])
  const page = await ctx.newPage()
  await signInViaForm(page, { email, password })
  await page.close()
}

test.describe('Red Team: proxy skip header (KW)', () => {
  test.setTimeout(120_000)

  test('KW: x-middleware-subrequest does not bypass the proxy auth gate', async ({ browser }) => {
    const { attackerUserId } = await seedRedTeamUsers()
    const { adminUserId } = await seedRedTeamAdmin()
    const anon = await browser.newContext({ storageState: undefined })
    const student = await browser.newContext({ storageState: undefined })
    const adminCtx = await browser.newContext({ storageState: undefined })
    try {
      for (const { path } of TARGETS) {
        const denied = { status: 307, path: '/', next: path, markup: '' }
        // Baseline: no header, no cookies.
        expect(await appPageStatus(anon, path, {}), `baseline ${path}`).toEqual(denied)
        for (const value of HEADER_VALUES) {
          const res = await appPageStatus(anon, path, { [SKIP_HEADER]: value })
          expect(res, `${path} header value ${value}`).toEqual(denied)
        }
      }

      // CONTROL: a real session reaches the page, with and without the header.
      await signInWithConsent(student, ATTACKER_EMAIL, ATTACKER_PASSWORD, attackerUserId)
      await signInWithConsent(adminCtx, ADMIN_EMAIL, ADMIN_PASSWORD, adminUserId)
      const controls = [
        { ctx: student, target: SETTINGS },
        { ctx: adminCtx, target: ADMIN_STUDENTS },
      ]
      for (const { ctx, target } of controls) {
        for (const headers of [{}, { [SKIP_HEADER]: HEADER_VALUES[0] as string }]) {
          const res = await appPageStatus(ctx, target.path, headers)
          const label = `${target.path} ${JSON.stringify(headers)}`
          expect(res.status, label).toBe(200)
          expect(res.markup, label).toContain(target.marker)
        }
      }
    } finally {
      await anon.close()
      await student.close()
      await adminCtx.close()
    }
  })
})
