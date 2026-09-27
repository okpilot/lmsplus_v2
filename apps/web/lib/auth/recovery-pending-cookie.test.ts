import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSet } = vi.hoisted(() => ({ mockSet: vi.fn() }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: mockSet }),
}))

import { setRecoveryPendingCookie } from './recovery-pending-cookie'

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
