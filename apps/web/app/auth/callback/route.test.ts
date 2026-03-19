import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const mockExchangeCodeForSession = vi.fn()
const mockGetUser = vi.fn()
const mockSignOut = vi.fn()
const mockFrom = vi.fn()
const mockCookieSet = vi.fn()

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
    from: mockFrom,
  }),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: mockCookieSet }),
}))

function makeRequest(url: string) {
  return new NextRequest(url)
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to / with missing_code error when no code is in the URL', async () => {
    const response = await GET(makeRequest('http://localhost:3000/auth/callback'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe('missing_code')
  })

  it('redirects to / with invalid_code error when code exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid' } })

    const response = await GET(makeRequest('http://localhost:3000/auth/callback?code=bad-code'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe('invalid_code')
  })

  it('redirects to /app/dashboard when code is valid and user has a profile', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: 'user-1' } }),
        }),
      }),
    })

    const response = await GET(makeRequest('http://localhost:3000/auth/callback?code=valid-code'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
  })

  it('signs out and redirects with not_registered when user has no profile', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null }),
        }),
      }),
    })
    mockSignOut.mockResolvedValue({})

    const response = await GET(makeRequest('http://localhost:3000/auth/callback?code=valid-code'))

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe('not_registered')
  })

  it('signs out and redirects with auth_failed when getUser returns no user', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockSignOut.mockResolvedValue({})

    const response = await GET(makeRequest('http://localhost:3000/auth/callback?code=valid-code'))

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe('auth_failed')
  })

  it('signs out and redirects with auth_failed when getUser returns an error', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'session expired' } })
    mockSignOut.mockResolvedValue({})

    const response = await GET(makeRequest('http://localhost:3000/auth/callback?code=valid-code'))

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe('auth_failed')
  })

  it('signs out on profile_lookup_failed (transient DB error)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: null,
            error: { code: 'PGRST500', message: 'connection lost' },
          }),
        }),
      }),
    })
    mockSignOut.mockResolvedValue({})

    const response = await GET(makeRequest('http://localhost:3000/auth/callback?code=valid-code'))

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe('profile_lookup_failed')
    consoleSpy.mockRestore()
  })

  it('redirects to /auth/reset-password and sets recovery cookie when next param is a recovery path', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: 'user-1' } }),
        }),
      }),
    })

    const response = await GET(
      makeRequest('http://localhost:3000/auth/callback?code=valid-code&next=/auth/reset-password'),
    )

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/reset-password')
    expect(mockCookieSet).toHaveBeenCalledWith(
      '__recovery_pending',
      '1',
      expect.objectContaining({ httpOnly: true, path: '/', maxAge: 600 }),
    )
  })
})
