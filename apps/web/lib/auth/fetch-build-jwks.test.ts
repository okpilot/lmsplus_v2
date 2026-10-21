import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBuildJwks } from './fetch-build-jwks'

const URL_BASE = 'https://proj.supabase.co'
const fetchMock = vi.fn()

function ok(body: unknown) {
  return { ok: true, json: async () => body }
}

describe('fetchBuildJwks', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('returns the serialized keys fetched from the project JWKS endpoint', async () => {
    const keys = [{ kid: 'k1', kty: 'EC' }]
    fetchMock.mockResolvedValue(ok({ keys, extra: 'dropped' }))
    await expect(fetchBuildJwks(URL_BASE)).resolves.toBe(JSON.stringify({ keys }))
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${URL_BASE}/auth/v1/.well-known/jwks.json`)
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('requests the JWKS path once when the Supabase URL ends with a slash', async () => {
    fetchMock.mockResolvedValue(ok({ keys: [{ kid: 'k1', kty: 'EC' }] }))
    await fetchBuildJwks(`${URL_BASE}/`)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${URL_BASE}/auth/v1/.well-known/jwks.json`)
  })

  it('returns empty without fetching when the Supabase URL is missing', async () => {
    await expect(fetchBuildJwks(undefined)).resolves.toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('returns empty when the response is not OK', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    await expect(fetchBuildJwks(URL_BASE)).resolves.toBe('')
    expect(console.error).toHaveBeenCalled()
  })

  it('returns empty when the request fails or times out', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'))
    await expect(fetchBuildJwks(URL_BASE)).resolves.toBe('')
    expect(console.error).toHaveBeenCalled()
  })

  it.each([
    ['a body that is not an object', null],
    ['keys that is not an array', { keys: 'x' }],
    ['a key that is not an object', { keys: ['x'] }],
    ['a key without a kid', { keys: [{ kty: 'EC' }] }],
    ['a key with an empty kid', { keys: [{ kid: '', kty: 'EC' }] }],
    ['a key without a kty', { keys: [{ kid: 'k1' }] }],
    ['an empty key set', { keys: [] }],
  ])('returns empty for %s', async (_label, body) => {
    fetchMock.mockResolvedValue(ok(body))
    await expect(fetchBuildJwks(URL_BASE)).resolves.toBe('')
    expect(console.error).toHaveBeenCalled()
  })

  it('returns empty when the body is not valid JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('bad json')
      },
    })
    await expect(fetchBuildJwks(URL_BASE)).resolves.toBe('')
  })
})
