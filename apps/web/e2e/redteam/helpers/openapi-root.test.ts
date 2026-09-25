import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set the required env var before the module under test is evaluated — the
// real module throws at import time if SUPABASE_SERVICE_ROLE_KEY isn't set.
vi.hoisted(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

import { fetchOpenApiRootField } from './openapi-root'

const mockFetch = vi.hoisted(() => vi.fn())

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  mockFetch.mockReset()
})

function okResponse(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body }
}

describe('fetchOpenApiRootField', () => {
  it('returns the requested top-level object', async () => {
    const paths = { '/rpc/is_admin': {} }
    mockFetch.mockResolvedValue(okResponse({ paths, definitions: {} }))

    await expect(fetchOpenApiRootField('paths')).resolves.toEqual(paths)
  })

  it('throws with the response status when the fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })

    await expect(fetchOpenApiRootField('paths')).rejects.toThrow(
      'OpenAPI root fetch failed: 503 Service Unavailable',
    )
  })

  it('throws when the requested field is missing', async () => {
    mockFetch.mockResolvedValue(okResponse({ paths: {} }))

    await expect(fetchOpenApiRootField('definitions')).rejects.toThrow(
      'OpenAPI root has no definitions object',
    )
  })

  it('throws when the requested field is not an object', async () => {
    mockFetch.mockResolvedValue(okResponse({ paths: 'nope' }))

    await expect(fetchOpenApiRootField('paths')).rejects.toThrow('OpenAPI root has no paths object')
  })

  it('throws when the body is not an object', async () => {
    mockFetch.mockResolvedValue(okResponse(null))

    await expect(fetchOpenApiRootField('paths')).rejects.toThrow('OpenAPI root has no paths object')
  })

  it('requests the OpenAPI root with the service-role apikey and Authorization headers', async () => {
    mockFetch.mockResolvedValue(okResponse({ paths: {} }))

    await fetchOpenApiRootField('paths')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/rest\/v1\/$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'test-service-role-key',
          Authorization: 'Bearer test-service-role-key',
          Accept: 'application/openapi+json',
        }),
      }),
    )
  })
})
