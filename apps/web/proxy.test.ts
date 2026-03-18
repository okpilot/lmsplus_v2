import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { proxy } from './proxy'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

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
      from: mockFrom,
    },
    response: MOCK_SESSION_RESPONSE,
  }),
}))

function makeRequest(pathname: string, base = 'http://localhost:3000') {
  return new NextRequest(new URL(pathname, base))
}

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
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

  it('redirects to / when authentication fails on an /app/* route', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'session expired' },
      })

      const response = await proxy(makeRequest('/app/dashboard'))

      expect(response.status).toBe(307)
      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/')
      expect(consoleSpy).toHaveBeenCalledWith('[proxy] getUser error:', 'session expired')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('does not redirect to /app/dashboard when authentication fails on /', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'session expired' },
      })

      const response = await proxy(makeRequest('/'))

      // Auth error means user is null — no authenticated redirect, fall through to login page
      expect(response).toBe(MOCK_SESSION_RESPONSE)
      expect(consoleSpy).toHaveBeenCalledWith('[proxy] getUser error:', 'session expired')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('redirects authenticated users with recovery cookie to /auth/reset-password', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const request = makeRequest('/')
    request.cookies.set('__recovery_pending', '1')
    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/reset-password')
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-token=refreshed')
  })

  it('lets authenticated users stay on / when error query param is present', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const response = await proxy(makeRequest('/?error=session_expired'))

    // Should NOT redirect to dashboard — error param must be shown on login page
    expect(response).toBe(MOCK_SESSION_RESPONSE)
  })

  it('passes an admin user through to /app/admin routes', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockFrom.mockReturnValue(buildChain({ data: { role: 'admin' }, error: null }))

    const response = await proxy(makeRequest('/app/admin/syllabus'))

    expect(response).toBe(MOCK_SESSION_RESPONSE)
  })

  it('returns 403 for a non-admin user accessing /app/admin routes', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
    mockFrom.mockReturnValue(buildChain({ data: { role: 'student' }, error: null }))

    const response = await proxy(makeRequest('/app/admin/syllabus'))

    expect(response.status).toBe(403)
    const setCookie403 = response.headers.get('set-cookie') ?? ''
    expect(setCookie403).toContain('sb-token=refreshed')
  })

  it('returns 503 when the admin role lookup fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'connection reset' } }))

      const response = await proxy(makeRequest('/app/admin/syllabus'))

      expect(response.status).toBe(503)
      const setCookie503 = response.headers.get('set-cookie') ?? ''
      expect(setCookie503).toContain('sb-token=refreshed')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[proxy] admin role lookup error:',
        'connection reset',
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
