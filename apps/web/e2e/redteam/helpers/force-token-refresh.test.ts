/**
 * Unit tests for the pure helpers exported from force-token-refresh.ts.
 *
 * These functions have no Playwright dependency — they operate on plain strings
 * and typed cookie-shaped objects. The two exported async functions
 * (readAuthSession, forceTokenRefresh) accept a BrowserContext and are tested
 * only at the E2E level (redteam Playwright suite).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  baseKeyOf,
  chunkValue,
  decodeSession,
  encodeSession,
  reconstructCookieValue,
} from './force-token-refresh'

/** Minimal cookie shape — only the fields the pure helpers read. */
type CookieFixture = { name: string; value: string }

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// baseKeyOf
// ---------------------------------------------------------------------------
describe('baseKeyOf', () => {
  it('strips a trailing .0 chunk suffix', () => {
    expect(baseKeyOf('sb-localhost-auth-token.0')).toBe('sb-localhost-auth-token')
  })

  it('strips a trailing .12 chunk suffix', () => {
    expect(baseKeyOf('sb-localhost-auth-token.12')).toBe('sb-localhost-auth-token')
  })

  it('leaves a non-chunked name unchanged', () => {
    expect(baseKeyOf('sb-localhost-auth-token')).toBe('sb-localhost-auth-token')
  })

  it('leaves names that end with a word (not a digit sequence) unchanged', () => {
    // e.g. a cookie that happens to have a trailing segment like `.refresh`
    expect(baseKeyOf('sb-myref-auth-token.refresh')).toBe('sb-myref-auth-token.refresh')
  })
})

// ---------------------------------------------------------------------------
// reconstructCookieValue
// ---------------------------------------------------------------------------
describe('reconstructCookieValue', () => {
  const BASE_KEY = 'sb-localhost-auth-token'

  it('returns the value of the un-chunked cookie when present', () => {
    const cookies: CookieFixture[] = [{ name: BASE_KEY, value: 'whole-value' }]
    expect(reconstructCookieValue(cookies, BASE_KEY)).toBe('whole-value')
  })

  it('prefers the un-chunked base-key cookie when chunks are also present', () => {
    const cookies: CookieFixture[] = [
      { name: `${BASE_KEY}.0`, value: 'chunk0' },
      { name: BASE_KEY, value: 'whole-value' },
    ]
    expect(reconstructCookieValue(cookies, BASE_KEY)).toBe('whole-value')
  })

  it('concatenates two chunks in index order', () => {
    const cookies: CookieFixture[] = [
      { name: `${BASE_KEY}.1`, value: 'second' },
      { name: `${BASE_KEY}.0`, value: 'first' },
    ]
    expect(reconstructCookieValue(cookies, BASE_KEY)).toBe('firstsecond')
  })

  it('concatenates three chunks in index order', () => {
    const cookies: CookieFixture[] = [
      { name: `${BASE_KEY}.2`, value: 'c' },
      { name: `${BASE_KEY}.0`, value: 'a' },
      { name: `${BASE_KEY}.1`, value: 'b' },
    ]
    expect(reconstructCookieValue(cookies, BASE_KEY)).toBe('abc')
  })

  it('throws when passed an empty cookie array', () => {
    // No cookies at all — nothing to reconstruct; hits the chunks.length === 0 guard.
    expect(() => reconstructCookieValue([], BASE_KEY)).toThrow(
      /found auth cookie name\(s\) but no value/,
    )
  })

  it("throws when only a different ref's auth cookie is present (no value for the requested base key)", () => {
    // A valid auth-token name, but for a different Supabase ref — it neither matches
    // the base key nor any of its `.N` chunks, so no value resolves. Distinct from the
    // empty-array case above and the non-integer-suffix case below.
    const cookies: CookieFixture[] = [{ name: 'sb-otherref-auth-token.0', value: 'chunk0' }]
    expect(() => reconstructCookieValue(cookies, BASE_KEY)).toThrow(
      /found auth cookie name\(s\) but no value/,
    )
  })

  it('ignores cookies whose chunk suffix is not an integer', () => {
    // `.refresh` is not a valid chunk index — should be filtered out
    const cookies: CookieFixture[] = [{ name: `${BASE_KEY}.refresh`, value: 'stray' }]
    expect(() => reconstructCookieValue(cookies, BASE_KEY)).toThrow(
      /found auth cookie name\(s\) but no value/,
    )
  })
})

// ---------------------------------------------------------------------------
// decodeSession
// ---------------------------------------------------------------------------
describe('decodeSession', () => {
  const validSession = { access_token: 'at', refresh_token: 'rt', expires_at: 9999 }

  it('decodes a base64- prefixed value correctly', () => {
    const encoded = `base64-${Buffer.from(JSON.stringify(validSession), 'utf-8').toString('base64url')}`
    const result = decodeSession(encoded)
    expect(result.access_token).toBe('at')
    expect(result.refresh_token).toBe('rt')
    expect(result.expires_at).toBe(9999)
  })

  it('decodes a plain JSON value (no base64- prefix)', () => {
    const result = decodeSession(JSON.stringify(validSession))
    expect(result.access_token).toBe('at')
  })

  it('throws when the base64 payload is not valid JSON', () => {
    const notJson = `base64-${Buffer.from('not-json', 'utf-8').toString('base64url')}`
    expect(() => decodeSession(notJson)).toThrow(/did not decode to JSON/)
  })

  it('throws when decoded JSON is missing access_token', () => {
    const bad = { refresh_token: 'rt' }
    const encoded = `base64-${Buffer.from(JSON.stringify(bad), 'utf-8').toString('base64url')}`
    expect(() => decodeSession(encoded)).toThrow(/missing access_token\/refresh_token/)
  })

  it('throws when decoded JSON is missing refresh_token', () => {
    const bad = { access_token: 'at' }
    const encoded = `base64-${Buffer.from(JSON.stringify(bad), 'utf-8').toString('base64url')}`
    expect(() => decodeSession(encoded)).toThrow(/missing access_token\/refresh_token/)
  })

  it('throws when the decoded value is null', () => {
    const encoded = `base64-${Buffer.from('null', 'utf-8').toString('base64url')}`
    expect(() => decodeSession(encoded)).toThrow(/missing access_token\/refresh_token/)
  })
})

// ---------------------------------------------------------------------------
// encodeSession + decodeSession roundtrip
// ---------------------------------------------------------------------------
describe('encodeSession', () => {
  it('produces a base64- prefixed string', () => {
    const session = { access_token: 'at', refresh_token: 'rt', expires_at: 1000 }
    expect(encodeSession(session)).toMatch(/^base64-/)
  })

  it('roundtrips with decodeSession without loss', () => {
    const session = {
      access_token: 'access-abc',
      refresh_token: 'refresh-xyz',
      expires_at: 1_700_000_000,
      expires_in: 3600,
      token_type: 'bearer',
    }
    const encoded = encodeSession(session)
    const decoded = decodeSession(encoded)
    expect(decoded).toEqual(session)
  })

  it('roundtrips a session whose expires_at was pushed into the past', () => {
    const original = { access_token: 'at', refresh_token: 'rt', expires_at: 9_999_999 }
    const modified = { ...original, expires_at: original.expires_at - 200, expires_in: 0 }
    const decoded = decodeSession(encodeSession(modified))
    expect(decoded.expires_at).toBe(original.expires_at - 200)
    expect(decoded.expires_in).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// chunkValue
// ---------------------------------------------------------------------------
describe('chunkValue', () => {
  const BASE_KEY = 'sb-localhost-auth-token'
  const MAX_CHUNK_SIZE = 3180

  it('returns a single un-chunked cookie when value fits within MAX_CHUNK_SIZE', () => {
    const value = 'a'.repeat(MAX_CHUNK_SIZE)
    const result = chunkValue(BASE_KEY, value)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe(BASE_KEY)
    expect(result[0].value).toBe(value)
  })

  it('splits into two chunks when value exceeds MAX_CHUNK_SIZE by one byte', () => {
    const value = 'a'.repeat(MAX_CHUNK_SIZE + 1)
    const result = chunkValue(BASE_KEY, value)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe(`${BASE_KEY}.0`)
    expect(result[0].value).toHaveLength(MAX_CHUNK_SIZE)
    expect(result[1].name).toBe(`${BASE_KEY}.1`)
    expect(result[1].value).toHaveLength(1)
  })

  it('splits into three chunks when value spans two full chunks plus one byte', () => {
    const value = 'a'.repeat(2 * MAX_CHUNK_SIZE + 1)
    const result = chunkValue(BASE_KEY, value)
    expect(result).toHaveLength(3)
    expect(result[0].name).toBe(`${BASE_KEY}.0`)
    expect(result[1].name).toBe(`${BASE_KEY}.1`)
    expect(result[2].name).toBe(`${BASE_KEY}.2`)
    expect(result[2].value).toHaveLength(1)
  })

  it('reconstructing chunks returns the original value', () => {
    // Verifies chunkValue is consistent with reconstructCookieValue
    const value = 'x'.repeat(MAX_CHUNK_SIZE * 2 + 500)
    const chunks = chunkValue(BASE_KEY, value)
    const reconstructed = chunks.map((c) => c.value).join('')
    expect(reconstructed).toBe(value)
  })

  it('handles an empty string as a single un-chunked cookie with empty value', () => {
    const result = chunkValue(BASE_KEY, '')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe(BASE_KEY)
    expect(result[0].value).toBe('')
  })
})

// ---------------------------------------------------------------------------
// chunkValue + reconstructCookieValue end-to-end roundtrip
// ---------------------------------------------------------------------------
describe('chunkValue → reconstructCookieValue roundtrip', () => {
  const BASE_KEY = 'sb-localhost-auth-token'
  const MAX_CHUNK_SIZE = 3180

  it('round-trips a value below MAX_CHUNK_SIZE via an un-chunked cookie', () => {
    const value = `base64-${'z'.repeat(100)}`
    const chunks = chunkValue(BASE_KEY, value)
    expect(reconstructCookieValue(chunks, BASE_KEY)).toBe(value)
  })

  it('round-trips a value spanning three chunks', () => {
    const value = `base64-${'q'.repeat(MAX_CHUNK_SIZE * 2 + 200)}`
    const chunks = chunkValue(BASE_KEY, value)
    expect(reconstructCookieValue(chunks, BASE_KEY)).toBe(value)
  })

  it('round-trips the full encode → chunk → reconstruct → decode pipeline', () => {
    const session = {
      access_token: 'long-access-token',
      refresh_token: 'long-refresh-token',
      expires_at: 1_800_000_000,
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: 'user-uuid', email: 'test@example.com' },
    }
    const encoded = encodeSession(session)
    const chunks = chunkValue(BASE_KEY, encoded)
    const reconstructed = reconstructCookieValue(chunks, BASE_KEY)
    const decoded = decodeSession(reconstructed)
    expect(decoded).toEqual(session)
  })
})
