import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set the required env var before the module under test is evaluated — the
// real module throws at import time if SUPABASE_SERVICE_ROLE_KEY isn't set.
vi.hoisted(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

import { deriveRpcSpecs } from './rpc-specs'

const mockFetch = vi.hoisted(() => vi.fn())

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  mockFetch.mockReset()
})

function openApiResponse(paths: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ paths }),
  }
}

describe('deriveRpcSpecs', () => {
  it('throws with the response status when the OpenAPI root fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })

    await expect(deriveRpcSpecs()).rejects.toThrow('OpenAPI root fetch failed: 503')
  })

  it('throws when the schema response carries no paths object', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) })

    await expect(deriveRpcSpecs()).rejects.toThrow('no paths object')
  })

  it('returns an empty list when the schema has no rpc paths', async () => {
    mockFetch.mockResolvedValue(openApiResponse({ '/questions': {} }))

    const result = await deriveRpcSpecs()

    expect(result).toEqual([])
  })

  it('reads the function name from the path and its params from the body schema', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        '/rpc/start_internal_exam_session': {
          post: {
            parameters: [
              {
                in: 'body',
                name: 'args',
                schema: {
                  properties: { p_code: { type: 'string' } },
                  required: ['p_code'],
                  type: 'object',
                },
              },
            ],
          },
        },
      }),
    )

    const result = await deriveRpcSpecs()

    expect(result).toEqual([{ name: 'start_internal_exam_session', params: ['p_code'] }])
  })

  it('returns an empty params array for a parameterless function', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        '/rpc/is_admin': {
          post: {
            parameters: [{ in: 'body', name: 'args', schema: { type: 'object' } }],
          },
        },
      }),
    )

    const result = await deriveRpcSpecs()

    expect(result).toEqual([{ name: 'is_admin', params: [] }])
  })

  it('returns an empty params array when the POST operation has no body parameter', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        '/rpc/some_fn': { post: { parameters: [] } },
      }),
    )

    const result = await deriveRpcSpecs()

    expect(result).toEqual([{ name: 'some_fn', params: [] }])
  })

  it('returns an empty params array when the POST operation is entirely absent', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        '/rpc/some_fn': {},
      }),
    )

    const result = await deriveRpcSpecs()

    expect(result).toEqual([{ name: 'some_fn', params: [] }])
  })

  it('ignores non-rpc paths', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        '/questions': { get: {} },
        '/rpc/is_admin': { post: { parameters: [{ in: 'body', schema: { type: 'object' } }] } },
      }),
    )

    const result = await deriveRpcSpecs()

    expect(result).toEqual([{ name: 'is_admin', params: [] }])
  })

  it('maps every rpc path in the schema independently', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        '/rpc/fn_a': {
          post: { parameters: [{ in: 'body', schema: { properties: { p_x: {} } } }] },
        },
        '/rpc/fn_b': { post: { parameters: [{ in: 'body', schema: { properties: {} } }] } },
      }),
    )

    const result = await deriveRpcSpecs()

    expect(result).toEqual([
      { name: 'fn_a', params: ['p_x'] },
      { name: 'fn_b', params: [] },
    ])
  })

  it('requests the OpenAPI root with the service-role apikey and Authorization headers', async () => {
    mockFetch.mockResolvedValue(openApiResponse({}))

    await deriveRpcSpecs()

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
