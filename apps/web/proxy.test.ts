import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConsentCookieValue } from '@/lib/consent/check-consent'
import { CONSENT_COOKIE } from '@/lib/consent/versions'
import { proxy } from './proxy'

const { mockVerifySessionUser } = vi.hoisted(() => ({ mockVerifySessionUser: vi.fn() }))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
}))

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
    set: vi.fn(),
  },
  _isMockSessionResponse: true,
}

vi.mock('@repo/db/middleware', () => ({
  createMiddlewareSupabaseClient: () => ({
    supabase: {
      auth: {},
      from: mockFrom,
    },
    response: MOCK_SESSION_RESPONSE,
  }),
}))

function makeRequest(pathname: string, base = 'http://localhost:3000') {
  return new NextRequest(new URL(pathname, base))
}

/** Create a request with a consent cookie bound to `userId` (simulates a user who has consented). */
function makeConsentedRequest(pathname: string, userId = 'user-1', base = 'http://localhost:3000') {
  const request = new NextRequest(new URL(pathname, base))
  request.cookies.set(CONSENT_COOKIE, buildConsentCookieValue(userId))
  return request
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the shared mock's headers each test so a header set by one test can never
    // leak into another (e.g. if a proxy() call throws before a try/finally cleanup runs).
    MOCK_SESSION_RESPONSE.headers = new Headers()
  })

  it('redirects unauthenticated requests for /app/dashboard to /', async () => {
    mockVerifySessionUser.mockResolvedValue(null)

    const response = await proxy(makeRequest('/app/dashboard'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/')
  })

  it('redirects unauthenticated requests for nested /app/* paths to /', async () => {
    mockVerifySessionUser.mockResolvedValue(null)

    const response = await proxy(makeRequest('/app/quiz/1'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/')
  })

  it('passes authenticated requests with consent cookie through to /app/* routes', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

    const response = await proxy(makeConsentedRequest('/app/dashboard'))

    // Should return the session-refreshed supabase response, not a redirect
    expect(response).toBe(MOCK_SESSION_RESPONSE)
  })

  it('reads no database row for an authenticated consented request to a non-admin /app route', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

    const response = await proxy(makeConsentedRequest('/app/dashboard'))

    expect(response).toBe(MOCK_SESSION_RESPONSE)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('sends a recovery-pinned session on the set-password page to reset-password without looping', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })
    const request = makeRequest('/auth/set-password?token_hash=abc&type=recovery')
    request.cookies.set('__recovery_pending', '1')

    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/reset-password')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('redirects authenticated users without consent cookie to the silent consent-refresh route', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

    const response = await proxy(makeRequest('/app/dashboard'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/consent-refresh')
  })

  it('redirects to consent-refresh when the cookie is bound to a different user id', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

    const response = await proxy(makeConsentedRequest('/app/dashboard', 'someone-else'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/consent-refresh')
  })

  it('ignores a cookie under the pre-rollout name and still requires the current-name cookie', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })
    const request = makeRequest('/app/dashboard')
    // A deployment kept alive by Skew Protection from before the CONSENT_COOKIE rename (#1377 follow-up) never
    // rewrites this old-named cookie — the new deployment must not accept it either.
    request.cookies.set('__consent', buildConsentCookieValue('user-1'))

    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/consent-refresh')
  })

  it('sends a recovery-pending session requesting consent-refresh to reset-password', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })
    const request = makeRequest('/auth/consent-refresh')
    request.cookies.set('__recovery_pending', '1')

    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/reset-password')
  })

  it('redirects authenticated users on / to /app/dashboard', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

    const response = await proxy(makeRequest('/'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/app/dashboard')
  })

  it('passes unauthenticated requests on / through to the login page', async () => {
    mockVerifySessionUser.mockResolvedValue(null)

    const response = await proxy(makeRequest('/'))

    expect(response).toBe(MOCK_SESSION_RESPONSE)
  })

  it('copies session cookies onto the redirect to / when unauthenticated on /app/*', async () => {
    mockVerifySessionUser.mockResolvedValue(null)

    const response = await proxy(makeRequest('/app/dashboard'))

    expect(response.status).toBe(307)
    // The refreshed session cookie must travel with the redirect so the
    // browser stores the new token even when being bounced to login.
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-token=refreshed')
  })

  it('copies session cookies onto the redirect to /app/dashboard when authenticated on /', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

    const response = await proxy(makeRequest('/'))

    expect(response.status).toBe(307)
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-token=refreshed')
  })

  it('redirects to / with the requested path when there is no verified user on an /app/* route', async () => {
    mockVerifySessionUser.mockResolvedValue(null)

    const response = await proxy(makeRequest('/app/quiz'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('next')).toBe('/app/quiz')
  })

  it('does not redirect to /app/dashboard when there is no verified user on /', async () => {
    mockVerifySessionUser.mockResolvedValue(null)

    const response = await proxy(makeRequest('/'))

    expect(response).toBe(MOCK_SESSION_RESPONSE)
  })

  it('redirects authenticated users with recovery cookie to /auth/reset-password', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

    const request = makeRequest('/')
    request.cookies.set('__recovery_pending', '1')
    const response = await proxy(request)

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/reset-password')
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('sb-token=refreshed')
  })

  it('lets authenticated users stay on / when error query param is present', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

    const response = await proxy(makeRequest('/?error=session_expired'))

    // Should NOT redirect to dashboard — error param must be shown on login page
    expect(response).toBe(MOCK_SESSION_RESPONSE)
  })

  it('passes a non-admin through /app/admin/* without an admin role lookup', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'student-1', email: null })

    const response = await proxy(makeConsentedRequest('/app/admin/syllabus', 'student-1'))

    expect(response).toBe(MOCK_SESSION_RESPONSE)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('preserves anti-cache headers on the login redirect', async () => {
    // A token refresh that ends in a redirect carries a fresh Set-Cookie; the
    // anti-cache headers must travel with it so a CDN cannot cache and replay it.
    mockVerifySessionUser.mockResolvedValue(null)
    MOCK_SESSION_RESPONSE.headers.set(
      'cache-control',
      'private, no-cache, no-store, must-revalidate, max-age=0',
    )
    MOCK_SESSION_RESPONSE.headers.set('expires', '0')
    MOCK_SESSION_RESPONSE.headers.set('pragma', 'no-cache')
    try {
      const response = await proxy(makeRequest('/app/dashboard'))

      expect(response.status).toBe(307)
      expect(response.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, must-revalidate, max-age=0',
      )
      expect(response.headers.get('expires')).toBe('0')
      expect(response.headers.get('pragma')).toBe('no-cache')
    } finally {
      MOCK_SESSION_RESPONSE.headers.delete('cache-control')
      MOCK_SESSION_RESPONSE.headers.delete('expires')
      MOCK_SESSION_RESPONSE.headers.delete('pragma')
    }
  })

  it('preserves anti-cache headers on the service-unavailable response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })
    mockReadTempPasswordState.mockRejectedValue(new Error('connection reset'))
    MOCK_SESSION_RESPONSE.headers.set('cache-control', 'private, no-store')
    try {
      const response = await proxy(makeConsentedRequest('/app/dashboard'))

      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      const setCookie503 = response.headers.get('set-cookie') ?? ''
      expect(setCookie503).toContain('sb-token=refreshed')
    } finally {
      MOCK_SESSION_RESPONSE.headers.delete('cache-control')
      consoleSpy.mockRestore()
    }
  })

  describe('next redirect param', () => {
    it('carries the requested /app path as next when redirecting an unauthenticated request', async () => {
      mockVerifySessionUser.mockResolvedValue(null)

      const response = await proxy(makeRequest('/app/internal-exam'))

      const location = new URL(response.headers.get('location') ?? '')
      expect(location.pathname).toBe('/')
      expect(location.searchParams.get('next')).toBe('/app/internal-exam')
    })

    it('omits next when the unauthenticated request already targets /app/dashboard', async () => {
      mockVerifySessionUser.mockResolvedValue(null)

      const response = await proxy(makeRequest('/app/dashboard'))

      const location = new URL(response.headers.get('location') ?? '')
      expect(location.searchParams.has('next')).toBe(false)
    })

    it('carries next through the consent-gate redirect', async () => {
      mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

      const response = await proxy(makeRequest('/app/internal-exam'))

      const location = new URL(response.headers.get('location') ?? '')
      expect(location.pathname).toBe('/auth/consent-refresh')
      expect(location.searchParams.get('next')).toBe('/app/internal-exam')
    })

    it('sends an authenticated root request to the validated next path', async () => {
      mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

      const response = await proxy(makeRequest('/?next=%2Fapp%2Fquiz'))

      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/app/quiz')
    })

    it('falls back to /app/dashboard when the authenticated next param is an open redirect', async () => {
      mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })

      const response = await proxy(makeRequest('/?next=%2F%2Fevil.com'))

      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/app/dashboard')
    })
  })
})
