import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetClaims, mockGetUser } = vi.hoisted(() => ({
  mockGetClaims: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getClaims: mockGetClaims, getUser: mockGetUser },
  }),
}))

import { getSessionUser } from './get-session-user'

const USER_ID = '00000000-0000-4000-a000-000000000001'

describe('getSessionUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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

  it('returns null when there is no session without asking the Auth server', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns null when the subject claim is missing', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { email: 'a@test.local' } }, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
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
})
