import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockGetClaims, mockGetUser } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetClaims: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getSession: mockGetSession, getClaims: mockGetClaims, getUser: mockGetUser },
  }),
}))

import { getSessionUser } from './get-session-user'

const USER_ID = '00000000-0000-4000-a000-000000000001'
const TOKEN = 'tok'

describe('getSessionUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetSession.mockResolvedValue({ data: { session: { access_token: TOKEN } }, error: null })
  })

  it('returns the id and email from verified claims', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, email: 'a@test.local' } },
      error: null,
    })
    await expect(getSessionUser()).resolves.toEqual({ id: USER_ID, email: 'a@test.local' })
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null email when the token carries none', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } }, error: null })
    await expect(getSessionUser()).resolves.toEqual({ id: USER_ID, email: null })
  })

  it('returns null when claims verification yields no data without asking the Auth server', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null when the subject claim is missing', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { email: 'a@test.local' } }, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
  })

  it('returns null when the subject claim is an empty string', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: '' } }, error: null })
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
    expect(spy).toHaveBeenCalledWith('[getSessionUser] getSession failed:', 'refresh failed')
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
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } }, error: null })
    await getSessionUser()
    expect(mockGetClaims).toHaveBeenCalledWith(TOKEN)
  })

  it('falls back to the verified user when claims verification errors', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    mockGetUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'a@test.local' } },
      error: null,
    })
    await expect(getSessionUser()).resolves.toEqual({ id: USER_ID, email: 'a@test.local' })
  })

  it('falls back to the verified user when claims verification throws', async () => {
    mockGetClaims.mockRejectedValue(new Error('JWKS fetch failed'))
    mockGetUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'a@test.local' } },
      error: null,
    })
    await expect(getSessionUser()).resolves.toEqual({ id: USER_ID, email: 'a@test.local' })
  })

  it('looks the user up by the session access token and reads the session once', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    await getSessionUser()
    expect(mockGetUser).toHaveBeenCalledWith(TOKEN)
    expect(mockGetSession).toHaveBeenCalledTimes(1)
  })

  it('returns null when the fallback user lookup also fails', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid claim') })
    await expect(getSessionUser()).resolves.toBeNull()
  })

  it('returns null when the fallback finds no user', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
  })

  it('returns null email when the fallback user has none', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    await expect(getSessionUser()).resolves.toEqual({ id: USER_ID, email: null })
  })

  it('logs the claims failure before falling back', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    await getSessionUser()
    expect(spy).toHaveBeenCalledWith('[getSessionUser] getClaims failed:', 'Invalid JWT signature')
  })

  it('logs the user lookup failure when the fallback errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid claim') })
    await getSessionUser()
    expect(spy).toHaveBeenCalledWith('[getSessionUser] getUser failed:', 'invalid claim')
  })
})
