import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetClaims, mockGetUser } = vi.hoisted(() => ({
  mockGetClaims: vi.fn(),
  mockGetUser: vi.fn(),
}))

import { verifySessionUser } from './verify-session-user'

// getUser stays on the client so a returning fallback fails the not-called assertions.
const client = {
  auth: { getClaims: mockGetClaims, getUser: mockGetUser },
}
const verify = () => verifySessionUser(client)

const USER_ID = '00000000-0000-4000-a000-000000000001'

describe('verifySessionUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns the id and email from verified claims', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, role: 'authenticated', email: 'a@test.local' } },
      error: null,
    })
    await expect(verify()).resolves.toEqual({ id: USER_ID, email: 'a@test.local' })
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null email when the token carries none', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, role: 'authenticated' } },
      error: null,
    })
    await expect(verify()).resolves.toEqual({ id: USER_ID, email: null })
  })

  it('returns null without a user lookup when claims verification yields no data', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: null })
    await expect(verify()).resolves.toBeNull()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it.each([undefined, 'anon', 'service_role'])(
    'returns null when the token is not a signed-in user session (role %s)',
    async (role) => {
      mockGetClaims.mockResolvedValue({ data: { claims: { sub: USER_ID, role } }, error: null })
      await expect(verify()).resolves.toBeNull()
    },
  )

  it('returns null when the subject claim is missing', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { role: 'authenticated', email: 'a@test.local' } },
      error: null,
    })
    await expect(verify()).resolves.toBeNull()
  })

  it('returns null when the subject claim is an empty string', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: '', role: 'authenticated' } },
      error: null,
    })
    await expect(verify()).resolves.toBeNull()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null for an anonymous session', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, role: 'authenticated', is_anonymous: true } },
      error: null,
    })
    await expect(verify()).resolves.toBeNull()
  })

  it('verifies the cookie session by calling getClaims with no arguments', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, role: 'authenticated' } },
      error: null,
    })
    await verify()
    expect(mockGetClaims).toHaveBeenCalledTimes(1)
    expect(mockGetClaims.mock.calls[0]).toEqual([])
  })

  it('returns null without logging when there is no session', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetClaims.mockResolvedValue({ data: null, error: null })
    await expect(verify()).resolves.toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns null and logs without a user lookup when claims verification errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    await expect(verify()).resolves.toBeNull()
    expect(spy).toHaveBeenCalledWith(
      '[verifySessionUser] getClaims failed:',
      'Invalid JWT signature',
    )
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null and logs without a user lookup when claims verification throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetClaims.mockRejectedValue(new Error('JWKS fetch failed'))
    await expect(verify()).resolves.toBeNull()
    expect(spy).toHaveBeenCalledWith('[verifySessionUser] getClaims failed:', 'JWKS fetch failed')
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})
