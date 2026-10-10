/**
 * Red Team Spec: legacy `__vdpl` deployment-pin cookie — Vector HY (#1506)
 *
 * Nothing sets `__vdpl` any more (Next's `x-deployment-id` header plus Vercel Skew
 * Protection keep a tab on its own deployment). The proxy only expires a leftover
 * `Path=/` pin carried by a request.
 * Attack: make the app plant a pin on a quiz session page, or keep a forged/stale
 * pin alive across proxied requests.
 * No DB rows are written: the consent cookie is forged for the attacker's own id
 * (Vector V), so the only state is the browser context, closed in afterEach.
 */

import { type APIResponse, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

const PIN_COOKIE = '__vdpl'
const STALE_PIN = 'dpl_redteam_stale'
const SESSION_URL = '/app/quiz/session/00000000-0000-4000-8000-000000000000'

function pinSetCookies(res: APIResponse): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .filter((v) => v.startsWith(`${PIN_COOKIE}=`))
}

async function jarPins(context: BrowserContext): Promise<string[]> {
  return (await context.cookies('http://localhost:3000/app/dashboard'))
    .filter((c) => c.name === PIN_COOKIE)
    .map((c) => c.path)
}

test.describe('Red Team: legacy __vdpl expiry (Vector HY, #1506)', () => {
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
    await context.clearCookies({ name: PIN_COOKIE })
  })

  test.afterEach(async () => {
    await context?.close()
  })

  test('a quiz session page never sets a pin (control: the page is reachable)', async () => {
    const control = await context.request.get('/app/dashboard', { maxRedirects: 0 })
    expect(control.status(), 'signed-in consented request must reach the page').toBeLessThan(300)

    const res = await context.request.get(SESSION_URL, { maxRedirects: 0 })
    expect(pinSetCookies(res)).toEqual([])
    expect(await jarPins(context)).toEqual([])
  })

  test('a forged site-wide pin is expired on any proxied request', async () => {
    for (const url of ['/app/dashboard', SESSION_URL]) {
      await context.addCookies([
        { name: PIN_COOKIE, value: STALE_PIN, domain: 'localhost', path: '/', sameSite: 'Strict' },
      ])
      expect(await jarPins(context)).toEqual(['/'])

      const res = await context.request.get(url, { maxRedirects: 0 })
      const cookies = pinSetCookies(res)
      expect(cookies).toHaveLength(1)
      expect(cookies[0]).toMatch(/^__vdpl=;/)
      expect(cookies[0]).toMatch(/Path=\/(;|$)/)
      expect(cookies[0]).toMatch(/Expires=Thu, 01 Jan 1970/)
      expect(await jarPins(context)).toEqual([])
    }
  })
})
