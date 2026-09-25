import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set the required env var before the module under test is evaluated — the
// real module throws at import time if SUPABASE_SERVICE_ROLE_KEY isn't set.
vi.hoisted(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

import { deriveTableSpecs, NIL_UUID } from './table-specs'

const mockFetch = vi.hoisted(() => vi.fn())

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  mockFetch.mockReset()
})

function openApiResponse(definitions: Record<string, { properties?: Record<string, unknown> }>) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ definitions }),
  }
}

describe('NIL_UUID', () => {
  it('is a syntactically valid nil UUID', () => {
    expect(NIL_UUID).toBe('00000000-0000-0000-0000-000000000000')
  })
})

describe('deriveTableSpecs', () => {
  it('throws with the response status when the OpenAPI root fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })

    await expect(deriveTableSpecs()).rejects.toThrow('OpenAPI root fetch failed: 503')
  })

  it('throws when the schema response carries no definitions object', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) })

    await expect(deriveTableSpecs()).rejects.toThrow('no definitions object')
  })

  it('returns an empty list when the schema has no definitions', async () => {
    mockFetch.mockResolvedValue(openApiResponse({}))

    const result = await deriveTableSpecs()

    expect(result).toEqual([])
  })

  it('picks id as the filter column when the table has an id property', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        questions: { properties: { id: { format: 'uuid' }, prompt: { format: 'text' } } },
      }),
    )

    const result = await deriveTableSpecs()

    expect(result).toEqual([{ name: 'questions', filterCol: 'id' }])
  })

  it('falls back to another uuid-formatted column when the table has no id property', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        quiz_session_answers: {
          properties: {
            session_id: { format: 'uuid' },
            selected_option_id: { format: 'text' },
          },
        },
      }),
    )

    const result = await deriveTableSpecs()

    expect(result).toEqual([{ name: 'quiz_session_answers', filterCol: 'session_id' }])
  })

  it('defaults filterCol to id when no id property and no uuid-formatted column exists', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        some_view: { properties: { label: { format: 'text' } } },
      }),
    )

    const result = await deriveTableSpecs()

    expect(result).toEqual([{ name: 'some_view', filterCol: 'id' }])
  })

  it('defaults filterCol to id when the table has no properties at all', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        empty_table: {},
      }),
    )

    const result = await deriveTableSpecs()

    expect(result).toEqual([{ name: 'empty_table', filterCol: 'id' }])
  })

  it('maps every table in the schema independently', async () => {
    mockFetch.mockResolvedValue(
      openApiResponse({
        courses: { properties: { id: { format: 'uuid' } } },
        organizations: { properties: { id: { format: 'uuid' } } },
      }),
    )

    const result = await deriveTableSpecs()

    expect(result).toEqual([
      { name: 'courses', filterCol: 'id' },
      { name: 'organizations', filterCol: 'id' },
    ])
  })

  it('requests the OpenAPI root with the service-role apikey and Authorization headers', async () => {
    mockFetch.mockResolvedValue(openApiResponse({}))

    await deriveTableSpecs()

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
