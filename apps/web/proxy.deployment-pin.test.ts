import { NextRequest, type NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConsentCookieValue } from '@/lib/consent/check-consent'
import { CONSENT_COOKIE } from '@/lib/consent/versions'
import { proxy } from './proxy'

// Split out of proxy.test.ts to stay under the test-file size cap — the
// legacy __vdpl cookie expiry is a self-contained concern with its own
// beforeEach/afterEach, sharing only the module-level mock shape.

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const { mockReadTempPasswordState, mockSignOutExpiredTempPassword } = vi.hoisted(() => ({
  mockReadTempPasswordState: vi.fn(),
  mockSignOutExpiredTempPassword: vi.fn(),
}))

vi.mock('@/lib/auth/temp-password', () => ({
  readTempPasswordState: mockReadTempPasswordState,
  signOutExpiredTempPassword: mockSignOutExpiredTempPassword,
}))

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
    delete: vi.fn(),
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

/** Create a request with a consent cookie bound to `userId` (simulates a user who has consented). */
function makeConsentedRequest(pathname: string, userId = 'user-1', base = 'http://localhost:3000') {
  const request = new NextRequest(new URL(pathname, base))
  request.cookies.set(CONSENT_COOKIE, buildConsentCookieValue(userId))
  return request
}

describe('legacy __vdpl deployment pin cookie', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    MOCK_SESSION_RESPONSE.headers = new Headers()
    // Armed so a regression to the old pin-setting code (it needs this id) goes red.
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_test_abc123'
    mockReadTempPasswordState.mockResolvedValue('none')
  })

  afterEach(() => {
    delete process.env.VERCEL_DEPLOYMENT_ID
  })

  it('never sets a pin on a session page', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    await proxy(makeConsentedRequest('/app/quiz/session/sess-1'))

    const vdplCall = (MOCK_SESSION_RESPONSE.cookies.set.mock.calls as unknown[][]).find(
      (c) => c[0] === '__vdpl',
    )
    expect(vdplCall).toBeUndefined()
  })

  it('expires a leftover pin carried by a session-page request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const request = makeConsentedRequest('/app/quiz/session/sess-1')
    request.cookies.set('__vdpl', 'old-deployment-id')

    await proxy(request)

    expect(MOCK_SESSION_RESPONSE.cookies.delete).toHaveBeenCalledWith('__vdpl')
  })

  it('expires a leftover pin on a page outside quiz sessions', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const request = makeConsentedRequest('/app/dashboard')
    request.cookies.set('__vdpl', 'old-deployment-id')

    await proxy(request)

    expect(MOCK_SESSION_RESPONSE.cookies.delete).toHaveBeenCalledWith('__vdpl')
  })

  it('expires a leftover pin on a request redirected to login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const cookies = MOCK_SESSION_RESPONSE.cookies
    const originalGetAll = cookies.getAll
    const expired = { name: '__vdpl', value: '', path: '/', expires: new Date(0) }
    const written: (typeof expired)[] = []
    cookies.delete.mockImplementation(() => written.push(expired))
    cookies.getAll = () => [...originalGetAll(), ...written] as ReturnType<typeof originalGetAll>

    const request = new NextRequest(new URL('/app/dashboard', 'http://localhost:3000'))
    request.cookies.set('__vdpl', 'old-deployment-id')

    try {
      const res = (await proxy(request)) as NextResponse
      expect(res.status).toBe(307)
      expect(res.cookies.get('__vdpl')?.expires).toEqual(new Date(0))
    } finally {
      cookies.getAll = originalGetAll
    }
  })

  it('leaves cookies untouched when the request carries no pin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    await proxy(makeConsentedRequest('/app/dashboard'))

    expect(MOCK_SESSION_RESPONSE.cookies.delete).not.toHaveBeenCalled()
    expect(MOCK_SESSION_RESPONSE.cookies.set).not.toHaveBeenCalled()
  })
})
