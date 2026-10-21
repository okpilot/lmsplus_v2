/**
 * Red Team Spec — Vector JP (#1578): algorithm confusion and attacker-signed tokens against the
 * JWKS inlined at build (`SUPABASE_BUILD_JWKS`, passed to getClaims as `options.jwks`).
 *
 * The attacker keeps a real, unexpired session cookie and rewrites only its access_token, payload
 * sub → victim id:
 *   (a) header alg ES384, real kid, original signature;
 *   (b) header alg RS256, real kid, original signature;
 *   (c) header alg HS256, real kid, original signature;
 *   (d) attacker P-256 key, header alg ES256 + real kid, valid signature under the attacker key;
 *   (e) attacker P-256 key, attacker kid + embedded `jwk` + `jku`, valid attacker signature.
 * Each must be unauthenticated: GET /app/dashboard → 307 to `/`.
 *
 * CONTROL: the unmodified cookie reaches /app/dashboard (200).
 *
 * The build-JWKS path is live only under `next build` + `next start` (CI: `pnpm start`); under
 * `pnpm dev` the same arms exercise the fetched-JWKS path.
 *
 * Status: Expected to PASS.
 */

import { generateKeyPairSync, sign } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
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
const ATTACKER_KID = '00000000-0000-4000-8000-0000000000jp'

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

const attackerKey = generateKeyPairSync('ec', { namedCurve: 'P-256' })

function signWithAttackerKey(header: Record<string, unknown>, payload: Record<string, unknown>) {
  const input = `${b64urlJson(header)}.${b64urlJson(payload)}`
  const sig = sign('sha256', Buffer.from(input), {
    key: attackerKey.privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `${input}.${sig.toString('base64url')}`
}

async function readSessionCookie(context: BrowserContext) {
  const cookies = (await context.cookies()).filter((c) => AUTH_TOKEN_COOKIE_RE.test(c.name))
  const template = cookies[0]
  if (!template) throw new Error('no sb-*-auth-token cookie after sign-in')
  const baseKey = baseKeyOf(template.name)
  return { template, baseKey, session: decodeSession(reconstructCookieValue(cookies, baseKey)) }
}

type Source = Awaited<ReturnType<typeof readSessionCookie>>

async function contextWithToken(
  browser: Browser,
  source: Source,
  opts: { accessToken: string; attackerUserId: string },
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ storageState: undefined })
  const session = { ...source.session, access_token: opts.accessToken }
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
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(opts.attackerUserId), url: BASE_URL },
  ])
  return ctx
}

async function dashboardStatus(ctx: BrowserContext) {
  const res = await ctx.request.get(`${BASE_URL}/app/dashboard`, { maxRedirects: 0 })
  const location = res.headers().location ?? ''
  return { status: res.status(), path: location ? new URL(location, BASE_URL).pathname : '' }
}

async function signInAttacker(browser: Browser, attackerUserId: string): Promise<Source> {
  const signer = await browser.newContext({ storageState: undefined })
  try {
    await signer.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerUserId), url: BASE_URL },
    ])
    const page = await signer.newPage()
    await signInViaForm(page, { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD })
    return await readSessionCookie(signer)
  } finally {
    await signer.close()
  }
}

function forgedTokens(real: Jwt, victimUserId: string): Array<[string, string]> {
  const payload = { ...real.payload, sub: victimUserId }
  const withAlg = (alg: string) =>
    joinJwt({ header: { ...real.header, alg }, payload, sig: real.sig })
  const attackerJwk = { ...attackerKey.publicKey.export({ format: 'jwk' }), kid: ATTACKER_KID }
  return [
    ['alg ES384, real kid', withAlg('ES384')],
    ['alg RS256, real kid', withAlg('RS256')],
    ['alg HS256, real kid', withAlg('HS256')],
    ['attacker key, real kid', signWithAttackerKey({ ...real.header, alg: 'ES256' }, payload)],
    [
      'attacker key, embedded jwk + jku',
      signWithAttackerKey(
        {
          alg: 'ES256',
          typ: 'JWT',
          kid: ATTACKER_KID,
          jwk: attackerJwk,
          jku: `${BASE_URL}/.well-known/jwks.json`,
        },
        payload,
      ),
    ],
  ]
}

/**
 * Under CI the server is `pnpm start` on the fresh build: the token's signing kid must be inlined in
 * `.next/server`, or JP would pass on the fetched-JWKS fallback alone.
 */
function expectKidInlinedInBuild(kid: string): void {
  const serverDir = path.resolve(__dirname, '../../.next/server')
  const files = readdirSync(serverDir, { recursive: true, encoding: 'utf-8' })
  const inlined = files.some(
    (f) => f.endsWith('.js') && readFileSync(path.join(serverDir, f), 'utf-8').includes(kid),
  )
  expect(inlined).toBe(true)
}

test.describe('Red Team: build-JWKS algorithm confusion and attacker-signed tokens (JP)', () => {
  test.setTimeout(90_000)

  test('JP: an alg-swapped or attacker-signed access token is unauthenticated', async ({
    browser,
  }) => {
    const { attackerUserId, victimUserId } = await seedRedTeamUsers()
    const source = await signInAttacker(browser, attackerUserId)

    const token = source.session.access_token
    if (typeof token !== 'string') throw new Error('session has no access_token')
    const real = splitJwt(token)
    expect(real.header.alg).toBe('ES256')
    expect(typeof real.header.kid).toBe('string')
    if (process.env.CI) expectKidInlinedInBuild(String(real.header.kid))
    expect(real.payload.sub).toBe(attackerUserId)
    expect(Number(real.payload.exp)).toBeGreaterThan(Date.now() / 1000 + 60)

    // CONTROL: the untouched token is admitted.
    const control = await contextWithToken(browser, source, { accessToken: token, attackerUserId })
    try {
      expect(await dashboardStatus(control)).toEqual({ status: 200, path: '' })
    } finally {
      await control.close()
    }

    for (const [label, forged] of forgedTokens(real, victimUserId)) {
      const ctx = await contextWithToken(browser, source, { accessToken: forged, attackerUserId })
      try {
        expect(await dashboardStatus(ctx), label).toEqual({ status: 307, path: '/' })
      } finally {
        await ctx.close()
      }
    }
  })
})
