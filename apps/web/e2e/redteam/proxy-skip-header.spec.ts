/**
 * Red Team Spec — Vector KW (#1132): `x-middleware-subrequest` against the proxy auth gate.
 *
 * CVE-2025-29927 let a client skip Next middleware by sending `x-middleware-subrequest`.
 * The installed Next (16.x) has no reference to that header (`grep -rl middleware-subrequest
 * node_modules/next/dist` finds none), so this pins the CURRENT protection and guards against the
 * mechanism returning: apps/web/proxy.ts redirects an unauthenticated `/app/*` request to
 * `/?next=<path>` (matcher `/app/:path*`).
 *
 * Attack: unauthenticated GET /app/settings, /app/admin/students and /app/dashboard?kw=1 (maxRedirects 0) carrying
 * the header with each of the values the CVE advisories used: `middleware`, `src/middleware`,
 * `proxy`, `src/proxy`, `pages/_middleware`, and the five-times-repeated `middleware:...`,
 * `proxy:...`, `src/middleware:...` and `src/proxy:...` forms.
 * Each must answer 307 to `/?next=<that path>` — never 200, and the body never contains the page marker. The dashboard
 * target carries `?kw=1` because `safeNextPath` drops the bare default destination. Only the proxy
 * adds `?next=` (`withNext`); `requireAuthUser` also redirects to a bare `/`, so asserting `next`
 * is what fails if the proxy were bypassed.
 *
 * CONTROL: the same request WITHOUT the header is also redirected (baseline), and a signed-in
 * user (consent cookie present) receives 200 on the same path with the header and without it
 * (attacker student on /app/settings and /app/dashboard?kw=1, red-team admin on /app/admin/students), so the redirects
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
  'src/middleware:src/middleware:src/middleware:src/middleware:src/middleware',
  'src/proxy:src/proxy:src/proxy:src/proxy:src/proxy',
  'pages/_middleware',
]

const SETTINGS = { path: '/app/settings', marker: 'Export My Data' }
const ADMIN_STUDENTS = { path: '/app/admin/students', marker: 'Student Management' }
const DASHBOARD = { path: '/app/dashboard?kw=1', marker: 'Welcome back' }
const TARGETS = [SETTINGS, ADMIN_STUDENTS, DASHBOARD]

async function appPageStatus(ctx: BrowserContext, path: string, headers: Record<string, string>) {
  const res = await ctx.request.get(`${BASE_URL}${path}`, { maxRedirects: 0, headers })
  const location = res.headers().location ?? ''
  const url = location ? new URL(location, BASE_URL) : null
  return {
    status: res.status(),
    path: url?.pathname ?? '',
    next: url?.searchParams.get('next') ?? '',
    markup: await res.text(),
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
      for (const target of TARGETS) {
        const { path } = target
        const denied = { status: 307, path: '/', next: path }
        const assertDenied = (res: Awaited<ReturnType<typeof appPageStatus>>, label: string) => {
          expect({ status: res.status, path: res.path, next: res.next }, label).toEqual(denied)
          expect(res.markup, label).not.toContain(target.marker)
        }
        // Baseline: no header, no cookies.
        assertDenied(await appPageStatus(anon, path, {}), `baseline ${path}`)
        for (const value of HEADER_VALUES) {
          const res = await appPageStatus(anon, path, { [SKIP_HEADER]: value })
          assertDenied(res, `${path} header value ${value}`)
        }
      }

      // CONTROL: a real session reaches the page, with and without the header.
      await signInWithConsent(student, ATTACKER_EMAIL, ATTACKER_PASSWORD, attackerUserId)
      await signInWithConsent(adminCtx, ADMIN_EMAIL, ADMIN_PASSWORD, adminUserId)
      const controls = [
        { ctx: student, target: SETTINGS },
        { ctx: student, target: DASHBOARD },
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
