/**
 * Red Team Spec: `__vdpl` deployment-pin cookie lifecycle — Vector HY (#1506)
 *
 * The proxy (`apps/web/lib/deployment-pin.ts` `syncDeploymentPin`) owns the pin:
 *   - a leftover site-wide (`Path=/`) pin reaching a non-session page is expired;
 *   - a Server Action (`next-action` header) on a non-session page leaves the
 *     session-scoped (`Path=/app/quiz/session`) pin alone: only the quiz start and
 *     resume actions expire it, from their own response;
 *   - a pin on a quiz session page is never expired.
 * Attack: keep a stale pin alive outside quiz sessions, or unpin a live quiz from
 * another tab with any request outside the session (navigation, a form POST a
 * cross-site page can send without a CORS preflight, or a Server Action).
 * Local runs have no VERCEL_DEPLOYMENT_ID, so the SET branch is unreachable here;
 * every expiry/keep branch is reachable and pinned below.
 * No DB rows are written: the consent cookie is forged for the attacker's own id
 * (Vector V), so the only state is the browser context, closed in afterEach.
 */

import { type APIResponse, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { DEPLOYMENT_PIN_COOKIE } from '../../lib/deployment-pin'
import { LIVE_SESSION_PREFIX } from '../../lib/deployment-version'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

const STALE_PIN = 'dpl_redteam_stale'
const SESSION_URL = `${LIVE_SESSION_PREFIX}/00000000-0000-4000-8000-000000000000`
const ACTION_HEADERS = { 'next-action': 'redteam-bogus-action-id' }

function pinSetCookies(res: APIResponse): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .filter((v) => v.startsWith(`${DEPLOYMENT_PIN_COOKIE}=`))
}

async function addPin(context: BrowserContext, path: string): Promise<void> {
  await context.addCookies([
    {
      name: DEPLOYMENT_PIN_COOKIE,
      value: STALE_PIN,
      domain: 'localhost',
      path,
      sameSite: 'Strict',
    },
  ])
}

async function jarPins(context: BrowserContext): Promise<string[]> {
  return (await context.cookies(`http://localhost:3000${SESSION_URL}`))
    .filter((c) => c.name === DEPLOYMENT_PIN_COOKIE)
    .map((c) => c.path)
}

test.describe('Red Team: __vdpl pin lifecycle (Vector HY, #1506)', () => {
  let context: BrowserContext

  test.beforeEach(async ({ browser }) => {
    const { attackerUserId } = await seedRedTeamUsers()
    context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    await page.goto('/')
    await page.fill('input[type="email"]', ATTACKER_EMAIL)
    await page.fill('input[type="password"]', ATTACKER_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(consent|app\/)/, { timeout: 15_000 })
    await context.addCookies([
      {
        name: CONSENT_COOKIE,
        value: buildConsentCookieValue(attackerUserId),
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ])
    await page.close()
    await context.clearCookies({ name: DEPLOYMENT_PIN_COOKIE })
  })

  test.afterEach(async () => {
    await context?.close()
  })

  test('a leftover site-wide pin is expired on a non-session page (control: no pin, no Set-Cookie)', async () => {
    const control = await context.request.get('/app/dashboard', { maxRedirects: 0 })
    expect(control.status(), 'signed-in consented request must reach the page').toBeLessThan(300)
    expect(pinSetCookies(control)).toEqual([])

    await addPin(context, '/')
    const res = await context.request.get('/app/dashboard', { maxRedirects: 0 })
    const cookies = pinSetCookies(res)
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toMatch(/^__vdpl=;/)
    expect(cookies[0]).toMatch(/Path=\/(;|$)/)
    expect(cookies[0]).toMatch(/Expires=Thu, 01 Jan 1970/)
    expect(await jarPins(context)).toEqual([])
  })

  test('a session-scoped pin survives a quiz session request, with and without a Server Action', async () => {
    await addPin(context, LIVE_SESSION_PREFIX)
    expect(await jarPins(context)).toEqual([LIVE_SESSION_PREFIX])

    const get = await context.request.get(SESSION_URL, { maxRedirects: 0 })
    expect(pinSetCookies(get)).toEqual([])
    const action = await context.request.post(SESSION_URL, {
      maxRedirects: 0,
      headers: ACTION_HEADERS,
    })
    expect(pinSetCookies(action)).toEqual([])
    expect(await jarPins(context)).toEqual([LIVE_SESSION_PREFIX])
  })

  test('no request outside quiz sessions, Server Action included, unpins a live quiz', async () => {
    await addPin(context, LIVE_SESSION_PREFIX)

    // Attack arm: navigation, header-less POST (cross-site form shape) and a Server Action
    // POST from another tab must all leave the scoped pin alone.
    const nav = await context.request.get('/app/dashboard', { maxRedirects: 0 })
    expect(pinSetCookies(nav)).toEqual([])
    const formPost = await context.request.post('/app/dashboard', {
      maxRedirects: 0,
      form: { x: '1' },
    })
    expect(pinSetCookies(formPost)).toEqual([])
    const action = await context.request.post('/app/dashboard', {
      maxRedirects: 0,
      headers: ACTION_HEADERS,
    })
    expect(pinSetCookies(action)).toEqual([])
    expect(await jarPins(context)).toEqual([LIVE_SESSION_PREFIX])
  })
})
