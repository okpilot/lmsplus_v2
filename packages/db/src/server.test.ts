import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.hoisted ensures mocks are set up before any module imports
const { mockCreateServerClient, mockCookiesGetAll, mockCookiesSet } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn(),
  mockCookiesGetAll: vi.fn(),
  mockCookiesSet: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: mockCookiesGetAll,
    set: mockCookiesSet,
  }),
}))

// Use dynamic import to avoid top-level await (node16 module resolution)
async function getModule() {
  return import('./server.js')
}

describe('createServerSupabaseClient', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    mockCreateServerClient.mockReturnValue({ auth: {}, from: vi.fn() })
    mockCookiesGetAll.mockReturnValue([])
    mockCookiesSet.mockReturnValue(undefined)
  })

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    const { createServerSupabaseClient } = await getModule()

    await expect(createServerSupabaseClient()).rejects.toThrow('Missing Supabase env vars')
  })

  it('throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''
    const { createServerSupabaseClient } = await getModule()

    await expect(createServerSupabaseClient()).rejects.toThrow('Missing Supabase env vars')
  })

  it('returns a Supabase client when env vars are present', async () => {
    const { createServerSupabaseClient } = await getModule()
    const client = await createServerSupabaseClient()

    expect(client).toBeDefined()
    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({ cookies: expect.any(Object) }),
    )
  })

  it('delegates getAll to the cookie store', async () => {
    mockCookiesGetAll.mockReturnValue([{ name: 'sb-token', value: 'abc' }])
    const { createServerSupabaseClient } = await getModule()

    await createServerSupabaseClient()

    const cookiesConfig = mockCreateServerClient.mock.calls[0]?.[2].cookies
    const result = cookiesConfig.getAll() as Array<{ name: string; value: string }>

    expect(result).toEqual([{ name: 'sb-token', value: 'abc' }])
    expect(mockCookiesGetAll).toHaveBeenCalledOnce()
  })

  it('writes cookies to the store when setAll is called in a writable context', async () => {
    const { createServerSupabaseClient } = await getModule()
    await createServerSupabaseClient()

    const cookiesConfig = mockCreateServerClient.mock.calls[0]?.[2].cookies
    cookiesConfig.setAll([{ name: 'sb-refresh', value: 'new-token', options: { httpOnly: true } }])

    expect(mockCookiesSet).toHaveBeenCalledWith('sb-refresh', 'new-token', { httpOnly: true })
  })

  it('does not throw when cookieStore.set throws (Server Component read-only context)', async () => {
    mockCookiesSet.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler')
    })

    const { createServerSupabaseClient } = await getModule()
    await createServerSupabaseClient()

    const cookiesConfig = mockCreateServerClient.mock.calls[0]?.[2].cookies

    expect(() =>
      cookiesConfig.setAll([{ name: 'sb-token', value: 'abc', options: {} }]),
    ).not.toThrow()
  })

  it('silently skips all cookies when setAll is called from a read-only context', async () => {
    mockCookiesSet.mockImplementation(() => {
      throw new Error('read-only')
    })

    const { createServerSupabaseClient } = await getModule()
    await createServerSupabaseClient()

    const cookiesConfig = mockCreateServerClient.mock.calls[0]?.[2].cookies

    expect(() =>
      cookiesConfig.setAll([
        { name: 'sb-token', value: 'abc', options: {} },
        { name: 'sb-refresh', value: 'xyz', options: {} },
      ]),
    ).not.toThrow()
  })
})
