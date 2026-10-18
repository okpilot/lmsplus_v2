import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const { mockGetUser, mockRpcHelper, mockCheckConsent, mockFrom, mockSignOut } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpcHelper: vi.fn(),
  mockCheckConsent: vi.fn(),
  mockFrom: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
    from: mockFrom,
  }),
}))

// The production code calls rpc() from @/lib/supabase-rpc, which is a typed
// wrapper around supabase.rpc(). We mock the wrapper module so we control
// what the route handler actually executes.
vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpcHelper,
}))

vi.mock('@/lib/consent/check-consent', () => ({
  checkConsentStatus: mockCheckConsent,
}))

vi.mock('@/lib/consent/consent-cookie', () => ({
  setConsentCookie: (
    store: { set: (name: string, value: string, opts: Record<string, unknown>) => void },
    userId: string,
    // Mirrors the real cookie name (`CONSENT_COOKIE` in versions.ts) as a literal —
    // vi.mock factories can't reference an outer-scope import.
  ) => store.set('__consent_u', `v1.0:v1.0:${userId}`, { httpOnly: true, maxAge: 31_536_000 }),
}))

function makeRequest(url: string) {
  return new NextRequest(url)
}

describe('GET /auth/login-complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to login when no session exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.search).toBe('')
    expect(mockRpcHelper).not.toHaveBeenCalled()
  })

  it('redirects to /app/dashboard when consent is satisfied', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: null })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
    expect(mockRpcHelper).toHaveBeenCalledWith(expect.anything(), 'record_login', {})
  })

  it('sets consent cookie when consent is satisfied', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: null })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('__consent_u=v1.0%3Av1.0%3Auser-1')
  })

  it('sets consent cookie with a 1-year max-age when consent is satisfied', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: null })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('Max-Age=31536000')
  })

  it('redirects to /consent when consent is required', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: null })
    mockCheckConsent.mockResolvedValue('required')

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/consent')
  })

  it('redirects to the validated next path when consent is satisfied', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: null })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(
      makeRequest('http://localhost:3000/auth/login-complete?next=%2Fapp%2Finternal-exam'),
    )

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/internal-exam')
  })

  it('falls back to /app/dashboard when the next path is an open redirect', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: null })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(
      makeRequest('http://localhost:3000/auth/login-complete?next=%2F%2Fevil.com'),
    )

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
  })

  it('carries the validated next path through to /consent when consent is required', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: null })
    mockCheckConsent.mockResolvedValue('required')

    const response = await GET(
      makeRequest('http://localhost:3000/auth/login-complete?next=%2Fapp%2Finternal-exam'),
    )

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/consent')
    expect(location.searchParams.get('next')).toBe('/app/internal-exam')
  })

  it('redirects to /consent even if record_login fails and consent is required', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: { message: 'DB connection lost' } })
    mockCheckConsent.mockResolvedValue('required')

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/consent')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[login-complete] record_login RPC failed:',
      'DB connection lost',
    )
    consoleSpy.mockRestore()
  })

  it('reads no users row and does not sign out on a plain login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: null })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/app/dashboard')
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
  })
})
