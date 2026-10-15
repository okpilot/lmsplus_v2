/**
 * Red Team Spec — Vector IA (#1412): forged access token in the auth cookie at the proxy.
 *
 * The proxy identifies the caller with getClaims() via verifySessionUser(). The local stack signs
 * access tokens ES256 with a JWKS-published kid, so getClaims verifies the signature locally;
 * a header without a usable key (alg none, unknown kid) falls back to getUser(token).
 *
 * The attacker keeps a real, unexpired session cookie and rewrites only its access_token:
 *   (a) payload sub → victim id, original ES256 signature kept;
 *   (b) alg "none", empty signature, payload sub → victim id;
 *   (c) unknown kid, original signature, payload sub → victim id.
 * Each must be treated as unauthenticated: GET /app/dashboard → 307 to `/`.
 *
 * CONTROL: the unmodified cookie reaches /app/dashboard (200).
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import {
  baseKeyOf,
  chunkValue,
  decodeSession,
  encodeSession,
  reconstructCookieValue,
} from './helpers/force-token-refresh'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'
import { signInViaForm } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const AUTH_TOKEN_COOKIE_RE = /^sb-.+-auth-token(?:\.\d+)?$/

const b64urlJson = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf-8').toString('base64url')
const fromB64urlJson = (s: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(s, 'base64url').toString('utf-8')) as Record<string, unknown>

type Jwt = { header: Record<string, unknown>; payload: Record<string, unknown>; sig: string }

function splitJwt(token: string): Jwt {
  const [h, p, s] = token.split('.')
  if (!h || !p || s === undefined) throw new Error('access token is not a JWT')
  return { header: fromB64urlJson(h), payload: fromB64urlJson(p), sig: s }
}

const joinJwt = (j: Jwt) => `${b64urlJson(j.header)}.${b64urlJson(j.payload)}.${j.sig}`

async function readSessionCookie(context: BrowserContext) {
  const cookies = (await context.cookies()).filter((c) => AUTH_TOKEN_COOKIE_RE.test(c.name))
  const template = cookies[0]
  if (!template) throw new Error('no sb-*-auth-token cookie after sign-in')
  const baseKey = baseKeyOf(template.name)
  return {
    cookies,
    template,
    baseKey,
    session: decodeSession(reconstructCookieValue(cookies, baseKey)),
  }
}

/** A fresh context holding the attacker's session cookie with access_token replaced. */
async function contextWithToken(
  browser: import('@playwright/test').Browser,
  source: Awaited<ReturnType<typeof readSessionCookie>>,
  accessToken: string,
  attackerUserId: string,
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ storageState: undefined })
  const session = { ...source.session, access_token: accessToken }
  const t = source.template
  await ctx.addCookies([
    ...chunkValue(source.baseKey, encodeSession(session)).map(({ name, value }) => ({
      name,
      value,
      domain: t.domain,
      path: t.path,
      expires: t.expires,
      httpOnly: t.httpOnly,
      secure: t.secure,
      sameSite: t.sameSite,
    })),
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerUserId), url: BASE_URL },
  ])
  return ctx
}

async function dashboardStatus(ctx: BrowserContext) {
  const res = await ctx.request.get(`${BASE_URL}/app/dashboard`, { maxRedirects: 0 })
  const location = res.headers().location ?? ''
  return { status: res.status(), path: location ? new URL(location, BASE_URL).pathname : '' }
}

test.describe('Red Team: forged access token at the proxy (IA)', () => {
  test.setTimeout(90_000)

  test('IA: a tampered, unsigned or unknown-kid access token is unauthenticated', async ({
    browser,
  }) => {
    const { attackerUserId, victimUserId } = await seedRedTeamUsers()
    const signer = await browser.newContext({ storageState: undefined })
    let source: Awaited<ReturnType<typeof readSessionCookie>>
    try {
      await signer.addCookies([
        { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerUserId), url: BASE_URL },
      ])
      const page = await signer.newPage()
      await signInViaForm(page, { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD })
      source = await readSessionCookie(signer)
    } finally {
      await signer.close()
    }

    const token = source.session.access_token
    if (typeof token !== 'string') throw new Error('session has no access_token')
    const real = splitJwt(token)
    expect(real.header.alg).toBe('ES256')
    expect(typeof real.header.kid).toBe('string')
    expect(real.payload.sub).toBe(attackerUserId)
    expect(Number(real.payload.exp)).toBeGreaterThan(Date.now() / 1000 + 60)

    const victimPayload = { ...real.payload, sub: victimUserId }
    const forged: Array<[string, string]> = [
      ['tampered sub', joinJwt({ ...real, payload: victimPayload })],
      [
        'alg none',
        joinJwt({ header: { alg: 'none', typ: 'JWT' }, payload: victimPayload, sig: '' }),
      ],
      [
        'unknown kid',
        joinJwt({
          header: { ...real.header, kid: '00000000-0000-4000-8000-00000000ia01' },
          payload: victimPayload,
          sig: real.sig,
        }),
      ],
    ]

    // CONTROL: the untouched token is admitted.
    const control = await contextWithToken(browser, source, token, attackerUserId)
    try {
      expect(await dashboardStatus(control)).toEqual({ status: 200, path: '' })
    } finally {
      await control.close()
    }

    for (const [label, forgedToken] of forged) {
      const ctx = await contextWithToken(browser, source, forgedToken, attackerUserId)
      try {
        expect(await dashboardStatus(ctx), label).toEqual({ status: 307, path: '/' })
      } finally {
        await ctx.close()
      }
    }
  })
})
