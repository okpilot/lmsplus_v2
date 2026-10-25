import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const { mockGetUser, mockGetClaims, mockSignOut, mockFrom, mockCookieSet } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetClaims: vi.fn(),
  mockSignOut: vi.fn(),
  mockFrom: vi.fn(),
  mockCookieSet: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser, getClaims: mockGetClaims, signOut: mockSignOut },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: async () => {
    const { data } = await mockGetUser()
    return data?.user ?? null
  },
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: mockCookieSet, getAll: () => [] }),
}))

function profileResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = self
  chain.eq = self
  chain.is = self
  chain.maybeSingle = async () => result
  chain.single = async () => result
  mockFrom.mockReturnValue(chain)
}

function req() {
  return new NextRequest('http://localhost:3000/auth/signout?reason=inactive')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'u1' } }, error: null })
  mockSignOut.mockResolvedValue({ error: null })
})

describe('GET /auth/signout', () => {
  it('signs out locally and redirects to /?error=account_inactive when the profile is null with no error', async () => {
    profileResult({ data: null, error: null })

    const res = await GET(req())

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    const loc = new URL(res.headers.get('location') ?? '')
    expect(loc.pathname).toBe('/')
    expect(loc.searchParams.get('error')).toBe('account_inactive')
  })

  it('sets Cache-Control no-store on the inactive redirect', async () => {
    profileResult({ data: null, error: null })

    const res = await GET(req())

    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('redirects an active caller to /app/dashboard without signing out', async () => {
    profileResult({ data: { id: 'u1' }, error: null })

    const res = await GET(req())

    expect(mockSignOut).not.toHaveBeenCalled()
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/app/dashboard')
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('redirects to /?error=profile_lookup_failed without signing out when the profile read errors', async () => {
    profileResult({ data: null, error: { message: 'db down' } })

    const res = await GET(req())

    expect(mockSignOut).not.toHaveBeenCalled()
    const loc = new URL(res.headers.get('location') ?? '')
    expect(loc.pathname).toBe('/')
    expect(loc.searchParams.get('error')).toBe('profile_lookup_failed')
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('redirects to / without signing out when there is no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockGetClaims.mockResolvedValue({ data: null, error: { message: 'no session' } })
    profileResult({ data: null, error: null })

    const res = await GET(req())

    expect(mockSignOut).not.toHaveBeenCalled()
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/')
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})
