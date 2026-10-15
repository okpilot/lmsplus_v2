import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockGetClaims, mockGetUser } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetClaims: vi.fn(),
  mockGetUser: vi.fn(),
}))

import { verifySessionUser } from './verify-session-user'

// getUser stays on the client so a returning fallback fails the not-called assertions.
const client = {
  auth: { getSession: mockGetSession, getClaims: mockGetClaims, getUser: mockGetUser },
}
const getSessionUser = () => verifySessionUser(client)

const USER_ID = '00000000-0000-4000-a000-000000000001'
const TOKEN = 'tok'

describe('verifySessionUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetSession.mockResolvedValue({ data: { session: { access_token: TOKEN } }, error: null })
  })

  it('returns the id and email from verified claims', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, role: 'authenticated', email: 'a@test.local' } },
      error: null,
    })
    await expect(getSessionUser()).resolves.toEqual({ id: USER_ID, email: 'a@test.local' })
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null email when the token carries none', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, role: 'authenticated' } },
      error: null,
    })
    await expect(getSessionUser()).resolves.toEqual({ id: USER_ID, email: null })
  })

  it('returns null without a user lookup when claims verification yields no data', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it.each([undefined, 'anon', 'service_role'])(
    'returns null when the token is not a signed-in user session (role %s)',
    async (role) => {
      mockGetClaims.mockResolvedValue({ data: { claims: { sub: USER_ID, role } }, error: null })
      await expect(getSessionUser()).resolves.toBeNull()
    },
  )

  it('returns null when the subject claim is missing', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { role: 'authenticated', email: 'a@test.local' } },
      error: null,
    })
    await expect(getSessionUser()).resolves.toBeNull()
  })

  it('returns null when the subject claim is an empty string', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: '', role: 'authenticated' } },
      error: null,
    })
    await expect(getSessionUser()).resolves.toBeNull()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null and logs when reading the session fails, without verifying anything', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: new Error('refresh failed'),
    })
    await expect(getSessionUser()).resolves.toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('[verifySessionUser] getSession failed:', 'refresh failed')
    expect(mockGetClaims).not.toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null when there is no session without verifying anything', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
    expect(mockGetClaims).not.toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null when the session has an empty access token', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: '' } }, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
    expect(mockGetClaims).not.toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('verifies exactly the session access token', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, role: 'authenticated' } },
      error: null,
    })
    await getSessionUser()
    expect(mockGetClaims).toHaveBeenCalledWith(TOKEN)
  })

  it('returns null and logs without a user lookup when claims verification errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    await expect(getSessionUser()).resolves.toBeNull()
    expect(spy).toHaveBeenCalledWith(
      '[verifySessionUser] getClaims failed:',
      'Invalid JWT signature',
    )
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null and logs without a user lookup when claims verification throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetClaims.mockRejectedValue(new Error('JWKS fetch failed'))
    await expect(getSessionUser()).resolves.toBeNull()
    expect(spy).toHaveBeenCalledWith('[verifySessionUser] getClaims failed:', 'JWKS fetch failed')
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})
