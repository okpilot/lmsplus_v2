import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConsentCookieValue } from '@/lib/consent/check-consent'
import { CONSENT_COOKIE } from '@/lib/consent/versions'
import { proxy } from './proxy'

// Split out of proxy.test.ts to stay under the test-file size cap — the
// __vdpl deployment-pinning cookie is a self-contained concern with its own
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

describe('__vdpl deployment pinning cookie', () => {
  const DEPLOYMENT_ID = 'dpl_test_abc123'

  beforeEach(() => {
    vi.clearAllMocks()
    MOCK_SESSION_RESPONSE.headers = new Headers()
    process.env.VERCEL_DEPLOYMENT_ID = DEPLOYMENT_ID
    mockReadTempPasswordState.mockResolvedValue('none')
  })

  afterEach(() => {
    delete process.env.VERCEL_DEPLOYMENT_ID
  })

  it('sets __vdpl cookie with correct options when on quiz session path, user authenticated, deployment id set, and cookie absent', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    await proxy(makeConsentedRequest('/app/quiz/session/sess-1'))

    expect(MOCK_SESSION_RESPONSE.cookies.set).toHaveBeenCalledWith('__vdpl', DEPLOYMENT_ID, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    })
  })

  it('sets secure: false when NODE_ENV is not production (test environment)', async () => {
    // NODE_ENV=test in Vitest — secure must be false so local dev cookies work
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    await proxy(makeConsentedRequest('/app/quiz/session/sess-1'))

    const call = (MOCK_SESSION_RESPONSE.cookies.set.mock.calls as unknown[][]).find(
      (c) => c[0] === '__vdpl',
    ) as [string, string, Record<string, unknown>] | undefined
    expect(call).toBeDefined()
    expect(call?.[2]?.secure).toBe(false)
  })

  it('does not set __vdpl cookie when it already exists on the request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const request = makeConsentedRequest('/app/quiz/session/sess-1')
    request.cookies.set('__vdpl', 'existing-deployment-id')

    await proxy(request)

    const vdplCall = (MOCK_SESSION_RESPONSE.cookies.set.mock.calls as unknown[][]).find(
      (c) => c[0] === '__vdpl',
    )
    expect(vdplCall).toBeUndefined()
  })

  it('does not set __vdpl cookie when not on the quiz session path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    await proxy(makeConsentedRequest('/app/dashboard'))

    const vdplCall = (MOCK_SESSION_RESPONSE.cookies.set.mock.calls as unknown[][]).find(
      (c) => c[0] === '__vdpl',
    )
    expect(vdplCall).toBeUndefined()
  })

  it('does not set __vdpl cookie when VERCEL_DEPLOYMENT_ID is not set', async () => {
    delete process.env.VERCEL_DEPLOYMENT_ID
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    await proxy(makeConsentedRequest('/app/quiz/session/sess-1'))

    const vdplCall = (MOCK_SESSION_RESPONSE.cookies.set.mock.calls as unknown[][]).find(
      (c) => c[0] === '__vdpl',
    )
    expect(vdplCall).toBeUndefined()
  })
})
