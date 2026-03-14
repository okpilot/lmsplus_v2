import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

// Mutable mock state for Supabase behaviour
const mockExchangeCodeForSession = vi.fn()
const mockGetUser = vi.fn()
const mockSignOut = vi.fn()
const mockFrom = vi.fn()

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

  it('redirects to /auth/verify with missing_code error when no code is in the URL', async () => {
    const request = makeRequest('http://localhost:3000/auth/callback')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/verify')
    expect(location.searchParams.get('error')).toBe('missing_code')
  })

  it('redirects to /auth/verify with invalid_code error when code exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid' } })

    const request = makeRequest('http://localhost:3000/auth/callback?code=bad-code')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/verify')
    expect(location.searchParams.get('error')).toBe('invalid_code')
  })

  it('redirects to /auth/verify with not_registered error when user has no profile row', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    // Simulate no profile found
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null }),
        }),
      }),
    })
    mockSignOut.mockResolvedValue({})

    const request = makeRequest('http://localhost:3000/auth/callback?code=valid-code')
    const response = await GET(request)

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/verify')
    expect(location.searchParams.get('error')).toBe('not_registered')
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

    const request = makeRequest('http://localhost:3000/auth/callback?code=valid-code')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
  })

  it('redirects to /auth/verify with auth_failed error when getUser returns no user after exchange', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockSignOut.mockResolvedValue({})

    const request = makeRequest('http://localhost:3000/auth/callback?code=valid-code')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/verify')
    expect(location.searchParams.get('error')).toBe('auth_failed')
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('redirects to /auth/verify with auth_failed error when getUser returns an error', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'session expired' } })
    mockSignOut.mockResolvedValue({})

    const request = makeRequest('http://localhost:3000/auth/callback?code=valid-code')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/verify')
    expect(location.searchParams.get('error')).toBe('auth_failed')
    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})
