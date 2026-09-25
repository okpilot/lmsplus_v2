import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const {
  mockGetUser,
  mockRpcHelper,
  mockCheckConsent,
  mockReadTempPasswordState,
  mockSignOutExpiredTempPassword,
  mockSignOut,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpcHelper: vi.fn(),
  mockCheckConsent: vi.fn(),
  mockReadTempPasswordState: vi.fn(),
  mockSignOutExpiredTempPassword: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
  }),
}))

vi.mock('@/lib/auth/temp-password', () => ({
  readTempPasswordState: mockReadTempPasswordState,
  signOutExpiredTempPassword: mockSignOutExpiredTempPassword,
}))

// The production code calls rpc() from @/lib/supabase-rpc, which is a typed
// wrapper around supabase.rpc(). We mock the wrapper module so we control
// what the route handler actually executes.
vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpcHelper,
}))

vi.mock('@/lib/consent/check-consent', () => ({
  checkConsentStatus: mockCheckConsent,
  buildConsentCookieValue: () => 'v1.0:v1.0',
}))

function makeRequest(url: string) {
  return new NextRequest(url)
}

describe('GET /auth/login-complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadTempPasswordState.mockResolvedValue('none')
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
    expect(setCookie).toContain('__consent=v1.0%3Av1.0')
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

  describe('temporary-password gate', () => {
    it('redirects an armed user to set-password carrying the requested next path', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      mockRpcHelper.mockResolvedValue({ data: null, error: null })
      mockReadTempPasswordState.mockResolvedValue('active')

      const response = await GET(
        makeRequest('http://localhost:3000/auth/login-complete?next=%2Fapp%2Finternal-exam'),
      )

      expect(response.status).toBe(307)
      const location = new URL(response.headers.get('location') ?? '')
      expect(location.pathname).toBe('/auth/set-password')
      expect(location.searchParams.get('next')).toBe('/app/internal-exam')
      expect(mockRpcHelper).toHaveBeenCalledWith(expect.anything(), 'record_login', {})
    })

    it('keeps an already-consented armed user from being asked to consent again', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      mockRpcHelper.mockResolvedValue({ data: null, error: null })
      mockReadTempPasswordState.mockResolvedValue('active')
      mockCheckConsent.mockResolvedValue('satisfied')

      const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/set-password')
      expect(response.cookies.get('__consent')?.value).toBe('v1.0:v1.0')
    })

    it('sends an armed user who has not consented to set-password without a consent cookie', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      mockRpcHelper.mockResolvedValue({ data: null, error: null })
      mockReadTempPasswordState.mockResolvedValue('active')
      mockCheckConsent.mockResolvedValue('required')

      const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/set-password')
      expect(response.cookies.get('__consent')).toBeUndefined()
    })

    it('redirects an armed user to set-password with no next param when none was requested', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      mockRpcHelper.mockResolvedValue({ data: null, error: null })
      mockReadTempPasswordState.mockResolvedValue('active')

      const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

      const location = new URL(response.headers.get('location') ?? '')
      expect(location.pathname).toBe('/auth/set-password')
      expect(location.searchParams.has('next')).toBe(false)
    })

    it('signs out globally and redirects to the expired-password error page', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      mockRpcHelper.mockResolvedValue({ data: null, error: null })
      mockReadTempPasswordState.mockResolvedValue('expired')

      const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

      expect(mockSignOutExpiredTempPassword).toHaveBeenCalledWith(expect.anything())
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/?error=temp_password_expired',
      )
      expect(mockRpcHelper).toHaveBeenCalledWith(expect.anything(), 'record_login', {})
    })

    it('signs out and redirects to the auth-failed error page when the state read fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      mockRpcHelper.mockResolvedValue({ data: null, error: null })
      mockReadTempPasswordState.mockRejectedValue(new Error('connection reset'))

      const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/?error=auth_failed')
      expect(mockSignOutExpiredTempPassword).not.toHaveBeenCalled()
      expect(mockRpcHelper).toHaveBeenCalledWith(expect.anything(), 'record_login', {})
      consoleSpy.mockRestore()
    })

    it('proceeds to the consent check when no temp password is armed', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      mockRpcHelper.mockResolvedValue({ data: null, error: null })
      mockReadTempPasswordState.mockResolvedValue('none')
      mockCheckConsent.mockResolvedValue('satisfied')

      const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

      expect(mockCheckConsent).toHaveBeenCalled()
      expect(response.status).toBe(307)
      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/app/dashboard')
    })
  })
})
