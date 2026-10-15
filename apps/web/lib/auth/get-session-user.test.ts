import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetClaims = vi.hoisted(() => vi.fn())

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getClaims: mockGetClaims } }),
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
  })

  it('returns null email when the token carries none', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } }, error: null })
    await expect(getSessionUser()).resolves.toEqual({ id: USER_ID, email: null })
  })

  it('returns null when the token fails verification', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })
    await expect(getSessionUser()).resolves.toBeNull()
  })

  it('returns null when there is no session', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
  })

  it('returns null when the subject claim is missing', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { email: 'a@test.local' } }, error: null })
    await expect(getSessionUser()).resolves.toBeNull()
  })
})
