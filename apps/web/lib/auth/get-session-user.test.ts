import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockVerifySessionUser, mockClient } = vi.hoisted(() => ({
  mockVerifySessionUser: vi.fn(),
  mockClient: { auth: {} },
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))
vi.mock('./verify-session-user', () => ({ verifySessionUser: mockVerifySessionUser }))

import { getSessionUser } from './get-session-user'

describe('getSessionUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns the user verified for the server session client', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: 'a@test.local' })
    await expect(getSessionUser()).resolves.toEqual({ id: 'u1', email: 'a@test.local' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  it('returns null when no session user is verified', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    await expect(getSessionUser()).resolves.toBeNull()
  })
})
