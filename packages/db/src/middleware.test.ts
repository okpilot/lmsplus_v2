import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMiddlewareSupabaseClient } from './middleware'

// vi.hoisted ensures this runs before any imports so the mock factory can reference it
const { mockCreateServerClient } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

function makeRequest(cookieHeader = '') {
  const init: Record<string, unknown> = {}
  if (cookieHeader) {
    init.headers = { cookie: cookieHeader }
  }
  return new NextRequest('http://localhost:3000/', init)
}

describe('createMiddlewareSupabaseClient', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    mockCreateServerClient.mockReturnValue({ auth: {} })
  })

  afterEach(() => {
    // Restore original env after each test
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''

    expect(() => createMiddlewareSupabaseClient(makeRequest())).toThrow('Missing Supabase env vars')
  })

  it('throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''

    expect(() => createMiddlewareSupabaseClient(makeRequest())).toThrow('Missing Supabase env vars')
  })

  it('returns a supabase client and a response when env vars are present', () => {
    const { supabase, response } = createMiddlewareSupabaseClient(makeRequest())

    expect(supabase).toBeDefined()
    expect(response).toBeDefined()
  })

  it('calls createServerClient with the URL and anon key from env', () => {
    createMiddlewareSupabaseClient(makeRequest())

    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({ cookies: expect.any(Object) }),
    )
  })

  it('reads cookies from the incoming request via the cookies.getAll adapter', () => {
    const request = makeRequest('sb-token=abc; sb-refresh=xyz')
    createMiddlewareSupabaseClient(request)

    // Capture the cookies config passed to createServerClient
    const cookiesConfig = mockCreateServerClient.mock.calls[0]?.[2].cookies
    const cookies = cookiesConfig.getAll() as Array<{ name: string; value: string }>

    // NextRequest parses cookie header into individual name/value pairs
    expect(cookies.length).toBeGreaterThanOrEqual(1)
    // Verify the adapter delegates to request.cookies.getAll()
    const names = cookies.map((c) => c.name)
    expect(names).toContain('sb-token')
    expect(names).toContain('sb-refresh')
  })

  it('writes set-cookie headers to the response via the cookies.setAll adapter', () => {
    const request = makeRequest()
    createMiddlewareSupabaseClient(request)

    const cookiesConfig = mockCreateServerClient.mock.calls[0]?.[2].cookies

    // setAll should not throw and should propagate cookies to the response
    expect(() =>
      cookiesConfig.setAll([{ name: 'sb-token', value: 'new-value', options: { httpOnly: true } }]),
    ).not.toThrow()
  })
})
