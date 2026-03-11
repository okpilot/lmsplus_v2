import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { proxy } from './proxy'

const mockGetUser = vi.fn()

// A plain object that stands in for the session-refreshed supabase NextResponse
const MOCK_SESSION_RESPONSE = {
  status: 200,
  headers: new Headers(),
  cookies: {
    getAll: () => [
      {
        name: 'sb-token',
        value: 'refreshed',
        httpOnly: true,
        secure: true,
        sameSite: 'lax' as const,
        path: '/',
      },
    ],
  },
  _isMockSessionResponse: true,
}

vi.mock('@repo/db/middleware', () => ({
  createMiddlewareSupabaseClient: () => ({
    supabase: {
      auth: { getUser: mockGetUser },
    },
    response: MOCK_SESSION_RESPONSE,
  }),
}))

function makeRequest(pathname: string, base = 'http://localhost:3000') {
  return new NextRequest(new URL(pathname, base))
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects unauthenticated requests for /app/dashboard to /', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await proxy(makeRequest('/app/dashboard'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/')
  })

  it('redirects unauthenticated requests for nested /app/* paths to /', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await proxy(makeRequest('/app/quiz/1'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/')
  })

  it('passes authenticated requests through to /app/* routes', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const response = await proxy(makeRequest('/app/dashboard'))

    // Should return the session-refreshed supabase response, not a redirect
    expect(response).toBe(MOCK_SESSION_RESPONSE)
  })

  it('redirects authenticated users on / to /app/dashboard', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const response = await proxy(makeRequest('/'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/app/dashboard')
  })

  it('passes unauthenticated requests on / through to the login page', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await proxy(makeRequest('/'))

    expect(response).toBe(MOCK_SESSION_RESPONSE)
  })

  it('copies session cookies onto the redirect to / when unauthenticated on /app/*', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await proxy(makeRequest('/app/dashboard'))

    expect(response.status).toBe(307)
    // The refreshed session cookie must travel with the redirect so the
    // browser stores the new token even when being bounced to login.
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-token=refreshed')
  })

  it('copies session cookies onto the redirect to /app/dashboard when authenticated on /', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const response = await proxy(makeRequest('/'))

    expect(response.status).toBe(307)
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-token=refreshed')
  })

  it('redirects /?code=<pkce> to /auth/callback?code=<pkce>', async () => {
    // getUser result does not matter for this branch — code check runs before auth guard
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await proxy(makeRequest('/?code=pkce-abc123'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/callback')
    expect(location.searchParams.get('code')).toBe('pkce-abc123')
  })

  it('copies session cookies onto the PKCE redirect to /auth/callback', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await proxy(makeRequest('/?code=pkce-abc123'))

    expect(response.status).toBe(307)
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-token=refreshed')
  })
})
