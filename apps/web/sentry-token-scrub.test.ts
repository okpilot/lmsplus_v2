import { describe, expect, it } from 'vitest'
import { SENTRY_TOKEN_SCRUB, scrubTokens } from './sentry-token-scrub'

const PATH = '/auth/set-password?token_hash=secret&type=recovery'
const FILTERED = '/auth/set-password?token_hash=[Filtered]&type=recovery'

describe('scrubTokens', () => {
  it('filters token_hash in request.url and keeps the other params', () => {
    const out = scrubTokens({ request: { url: `https://x.test${PATH}` } })
    expect(out.request.url).toBe(`https://x.test${FILTERED}`)
  })

  it('filters http.target on a streamed span', () => {
    const span = { name: 'GET /auth/set-password', attributes: { 'http.target': PATH } }
    const out = scrubTokens(span)
    expect(out.attributes['http.target']).toBe(FILTERED)
    expect(out.name).toBe('GET /auth/set-password')
  })

  it('filters http.target wrapped as a typed attribute value', () => {
    const span = { attributes: { 'http.target': { value: PATH, type: 'string' } } }
    const out = scrubTokens(span)
    expect(out.attributes['http.target']).toEqual({ value: FILTERED, type: 'string' })
  })

  it('filters a bare url.query string', () => {
    const event = {
      contexts: { trace: { data: { 'url.query': 'token_hash=secret&type=recovery' } } },
    }
    expect(scrubTokens(event).contexts.trace.data['url.query']).toBe(
      'token_hash=[Filtered]&type=recovery',
    )
  })

  it('filters breadcrumb data.to', () => {
    expect(scrubTokens({ data: { to: PATH } }).data.to).toBe(FILTERED)
  })

  it('filters a URL-encoded token_hash inside a next param', () => {
    const next = 'next=%2Fauth%2Fset-password%3Ftoken_hash%3Dsecret%26type%3Drecovery'
    const out = scrubTokens({ url: `/login?${next}` })
    expect(out.url).not.toContain('secret')
    expect(out.url).toContain('type%3Drecovery')
  })

  it('filters strings inside nested arrays', () => {
    const out = scrubTokens({ list: [[PATH], { a: [PATH] }] })
    expect(JSON.stringify(out)).not.toContain('secret')
  })

  it('leaves non-token strings, numbers and null untouched', () => {
    const input = { s: '/app/dashboard?x=1', n: 200, z: null, u: undefined, b: true }
    expect(scrubTokens(input)).toEqual(input)
  })

  it('returns a Date as the same instance', () => {
    const d = new Date()
    expect(scrubTokens({ d }).d).toBe(d)
  })

  it('does not throw on a cyclic object', () => {
    const a: Record<string, unknown> = { url: PATH }
    a.self = a
    expect(() => scrubTokens(a)).not.toThrow()
    const out = scrubTokens(a)
    expect((out.self as Record<string, unknown>).url).not.toContain('secret')
  })

  it('filters an object referenced from two places', () => {
    const shared = { url: PATH }
    const out = scrubTokens({ a: shared, b: [shared] })
    expect(JSON.stringify(out)).not.toContain('secret')
  })

  it('filters a string stored under a token_hash or tokenHash key', () => {
    const out = scrubTokens({
      extra: { searchParams: { token_hash: 'secret', type: 'recovery' } },
      tokenHash: 'secret',
    })
    expect(JSON.stringify(out)).not.toContain('secret')
    expect(out.extra.searchParams.type).toBe('recovery')
  })

  it('still walks a non-string value under a token_hash key', () => {
    const out = scrubTokens({ token_hash: { url: PATH } })
    expect(out.token_hash).toEqual({ url: FILTERED })
  })

  it('filters a URL instance', () => {
    const out = scrubTokens({ u: new URL(`https://x.test${PATH}`) })
    expect(out.u).toBe(`https://x.test${FILTERED}`)
  })

  it('filters a percent-encoded token_hash value in a query string', () => {
    const out = scrubTokens({ q: '?token_hash=%61bc&type=recovery' })
    expect(out.q).toBe('?token_hash=[Filtered]&type=recovery')
  })

  it('filters a percent-encoded token_hash value in a URL instance', () => {
    const out = scrubTokens({
      u: new URL('https://x.test/auth/set-password?token_hash=%61bc&type=recovery'),
    })
    expect(out.u).toBe('https://x.test/auth/set-password?token_hash=[Filtered]&type=recovery')
  })

  it('filters a percent-encoded token_hash value inside an encoded next param', () => {
    const next = 'next=%2Fa%3Ftoken_hash%3D%61bc%26type%3Drecovery'
    const out = scrubTokens({ url: `/login?${next}` })
    expect(out.url).not.toContain('%61bc')
    expect(out.url).toContain('type%3Drecovery')
  })

  it('filters a URLSearchParams instance', () => {
    const out = scrubTokens({ q: new URLSearchParams('token_hash=secret&type=recovery') })
    expect(out.q).toBe('token_hash=[Filtered]&type=recovery')
  })

  it('does not mutate its input', () => {
    const input = { request: { url: PATH }, list: [PATH] }
    const snapshot = JSON.stringify(input)
    scrubTokens(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})

describe('SENTRY_TOKEN_SCRUB', () => {
  it('wires scrubTokens into breadcrumb, event and span hooks', () => {
    expect(SENTRY_TOKEN_SCRUB.beforeBreadcrumb).toBe(scrubTokens)
    expect(SENTRY_TOKEN_SCRUB.beforeSend).toBe(scrubTokens)
    expect(SENTRY_TOKEN_SCRUB.beforeSendSpan).toBe(scrubTokens)
  })
})
