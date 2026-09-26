import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_COOKIE } from '@/lib/consent/versions'
import { GET, POST } from './route'

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
    expect(response.cookies.get(CONSENT_COOKIE)?.value).toBe('v1.0:v1.0:user-1')
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
})

describe('POST /auth/consent-refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('replays a redirected Server Action POST to next with a 307 and the user-bound cookie when consent is satisfied', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCheckConsent.mockResolvedValue('satisfied')

    const response = await POST(
      makeRequest('http://localhost:3000/auth/consent-refresh?next=%2Fapp%2Fquiz'),
    )

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/quiz')
    expect(response.cookies.get(CONSENT_COOKIE)?.value).toBe('v1.0:v1.0:user-1')
  })

  it('redirects a Server Action POST to /consent when consent is required', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCheckConsent.mockResolvedValue('required')

    const response = await POST(
      makeRequest('http://localhost:3000/auth/consent-refresh?next=%2Fapp%2Fquiz'),
    )

    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/consent')
    expect(location.searchParams.get('next')).toBe('/app/quiz')
  })
})
