import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConsentCookieValue } from '@/lib/consent/check-consent'
import { CONSENT_COOKIE } from '@/lib/consent/versions'
import { proxy } from './proxy'

// Split out of proxy.test.ts to keep that file under the test-file size cap
// (.claude/limits.json) — this file needs its own copy of the middleware
// mock harness since vi.mock is scoped per test file.
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
    set: vi.fn(),
  },
  _isMockSessionResponse: true,
}

vi.mock('@repo/db/middleware', () => ({
  createMiddlewareSupabaseClient: () => ({
    supabase: {
      auth: { getUser: mockGetUser },
      from: vi.fn(),
    },
    response: MOCK_SESSION_RESPONSE,
  }),
}))

const { mockReadTempPasswordState, mockSignOutExpiredTempPassword } = vi.hoisted(() => ({
  mockReadTempPasswordState: vi.fn(),
  mockSignOutExpiredTempPassword: vi.fn(),
}))

vi.mock('@/lib/auth/temp-password', () => ({
  readTempPasswordState: mockReadTempPasswordState,
  signOutExpiredTempPassword: mockSignOutExpiredTempPassword,
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

describe('proxy — temporary-password gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MOCK_SESSION_RESPONSE.headers = new Headers()
    mockReadTempPasswordState.mockResolvedValue('none')
  })

  it('redirects an armed user to set-password with the requested path as next', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockReadTempPasswordState.mockResolvedValue('active')

    const response = await proxy(makeConsentedRequest('/app/internal-exam'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/set-password')
    expect(location.searchParams.get('next')).toBe('/app/internal-exam')
  })

  it('redirects an armed user on /app/dashboard to set-password with no next param', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockReadTempPasswordState.mockResolvedValue('active')

    const response = await proxy(makeConsentedRequest('/app/dashboard'))

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/set-password')
    expect(location.searchParams.has('next')).toBe(false)
  })

  it('signs out globally and redirects to the expired-password error page', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockReadTempPasswordState.mockResolvedValue('expired')

    const response = await proxy(makeConsentedRequest('/app/dashboard'))

    expect(mockSignOutExpiredTempPassword).toHaveBeenCalledWith(expect.anything())
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/?error=temp_password_expired',
    )
  })

  it('returns 503 with security headers when the temp password state read fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      mockReadTempPasswordState.mockRejectedValue(new Error('connection reset'))

      const response = await proxy(makeConsentedRequest('/app/dashboard'))

      expect(response.status).toBe(503)
      expect(response.headers.get('Content-Security-Policy')).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      )
      expect(response.headers.get('Strict-Transport-Security')).toBe(
        'max-age=63072000; includeSubDomains; preload',
      )
      expect(mockSignOutExpiredTempPassword).not.toHaveBeenCalled()
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('falls through to the consent gate unchanged when no temp password is armed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockReadTempPasswordState.mockResolvedValue('none')

    const response = await proxy(makeRequest('/app/dashboard'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/consent-refresh')
  })

  it('redirects an armed but consent-less user to set-password, not to consent-refresh', async () => {
    // Proves gate ORDERING: the temp-password gate must run before the consent
    // gate (proxy.ts comment). Without the consent cookie, a consent-gate-first
    // implementation would send this request to /auth/consent-refresh instead.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockReadTempPasswordState.mockResolvedValue('active')

    const response = await proxy(makeRequest('/app/dashboard'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/set-password')
  })

  it('does not gate a request to /auth/set-password itself', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockReadTempPasswordState.mockResolvedValue('active')

    const response = await proxy(makeConsentedRequest('/auth/set-password'))

    expect(response).toBe(MOCK_SESSION_RESPONSE)
    expect(mockReadTempPasswordState).not.toHaveBeenCalled()
  })

  it('does not read temp password state for a logged-out /app request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await proxy(makeRequest('/app/dashboard'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/')
    expect(mockReadTempPasswordState).not.toHaveBeenCalled()
  })
})
