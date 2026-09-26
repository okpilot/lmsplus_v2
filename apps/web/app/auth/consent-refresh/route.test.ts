import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const { mockGetUser, mockCheckConsent } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCheckConsent: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/consent/check-consent', () => ({
  checkConsentStatus: mockCheckConsent,
  buildConsentCookieValue: (userId: string) => `v1.0:v1.0:${userId}`,
}))

function makeRequest(url: string) {
  return new NextRequest(url)
}

describe('GET /auth/consent-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to / when no session exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await GET(makeRequest('http://localhost:3000/auth/consent-refresh'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(mockCheckConsent).not.toHaveBeenCalled()
  })

  it('redirects to /consent carrying next when consent is required', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCheckConsent.mockResolvedValue('required')

    const response = await GET(
      makeRequest('http://localhost:3000/auth/consent-refresh?next=%2Fapp%2Fquiz'),
    )

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/consent')
    expect(location.searchParams.get('next')).toBe('/app/quiz')
  })

  it('redirects to the requested next path with a user-bound cookie when consent is satisfied', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(
      makeRequest('http://localhost:3000/auth/consent-refresh?next=%2Fapp%2Fquiz'),
    )

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/quiz')
    expect(response.cookies.get('__consent')?.value).toBe('v1.0:v1.0:user-1')
  })

  it('falls back to /app/dashboard when consent is satisfied and no next was requested', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(makeRequest('http://localhost:3000/auth/consent-refresh'))

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
  })

  it('falls back to /app/dashboard when the requested next path is an open redirect', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(
      makeRequest('http://localhost:3000/auth/consent-refresh?next=%2F%2Fevil.example'),
    )

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
  })

  it('falls back to /app/dashboard when the requested next path is outside /app', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await GET(
      makeRequest('http://localhost:3000/auth/consent-refresh?next=%2Fauth%2Fcallback'),
    )

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
  })

  it('redirects to /consent when the consent-status check errors', async () => {
    // checkConsentStatus itself resolves 'required' on an RPC error (see
    // check-consent.test.ts) — this pins that the route trusts that contract
    // rather than re-deciding on error.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCheckConsent.mockResolvedValue('required')

    const response = await GET(makeRequest('http://localhost:3000/auth/consent-refresh'))

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/consent')
  })
})
