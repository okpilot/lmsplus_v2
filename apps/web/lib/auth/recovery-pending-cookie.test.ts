import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSet, mockDelete } = vi.hoisted(() => ({ mockSet: vi.fn(), mockDelete: vi.fn() }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: mockSet, delete: mockDelete }),
}))

import { clearRecoveryPendingCookie, setRecoveryPendingCookie } from './recovery-pending-cookie'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('setRecoveryPendingCookie', () => {
  it('sets a short-lived httpOnly cookie scoped to the whole site', async () => {
    await setRecoveryPendingCookie()

    expect(mockSet).toHaveBeenCalledWith('__recovery_pending', '1', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })
  })
})

describe('clearRecoveryPendingCookie', () => {
  it('deletes the recovery-pending cookie', async () => {
    await clearRecoveryPendingCookie()

    expect(mockDelete).toHaveBeenCalledWith('__recovery_pending')
  })
})
