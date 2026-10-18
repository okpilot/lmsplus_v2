import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSetPin, mockClearPin, mockRecordSet, mockUpdateUser, mockSignOut } = vi.hoisted(() => ({
  mockSetPin: vi.fn(),
  mockClearPin: vi.fn(),
  mockRecordSet: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('@/lib/auth/recovery-pending-cookie', () => ({
  setRecoveryPendingCookie: (...args: unknown[]) => mockSetPin(...args),
  clearRecoveryPendingCookie: (...args: unknown[]) => mockClearPin(...args),
}))

vi.mock('@/lib/auth/finish-self-password-change', () => ({
  recordOwnPasswordSet: (...args: unknown[]) => mockRecordSet(...args),
}))

import { completeLinkPasswordSet } from './complete-link-password-set'

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000003'
const supabase = {
  auth: { updateUser: mockUpdateUser, signOut: mockSignOut },
} as unknown as Parameters<typeof completeLinkPasswordSet>[0]

function run() {
  return completeLinkPasswordSet(supabase, { userId: USER_ID, password: 'newpassword123' })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUpdateUser.mockResolvedValue({ error: null })
  mockSignOut.mockResolvedValue({ error: null })
})

describe('completeLinkPasswordSet', () => {
  it('pins the session to reset-password before the password is written', async () => {
    const order: string[] = []
    mockSetPin.mockImplementation(async () => {
      order.push('pin')
    })
    mockUpdateUser.mockImplementation(async () => {
      order.push('update')
      return { error: null }
    })

    await run()

    expect(order).toEqual(['pin', 'update'])
  })

  it('lifts the pin, audits, signs out other sessions and heads to login-complete on success', async () => {
    const result = await run()

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
    expect(mockClearPin).toHaveBeenCalledTimes(1)
    expect(mockRecordSet).toHaveBeenCalledWith(supabase, {
      userId: USER_ID,
      context: 'setPasswordFromLink',
    })
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(result).toEqual({ success: true, redirectTo: '/auth/login-complete' })
  })

  it('still succeeds when signing out other sessions fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSignOut.mockResolvedValue({ error: { message: 'boom' } })

    const result = await run()

    expect(result).toEqual({ success: true, redirectTo: '/auth/login-complete' })
    expect(spy).toHaveBeenCalledWith('[setPasswordFromLink] sign-out others failed:', 'boom')
  })

  it('sends the student to reset-password with the pin kept when the password write fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUpdateUser.mockResolvedValue({ error: { message: 'weak password', code: 'weak_password' } })

    const result = await run()

    expect(result).toEqual({
      success: false,
      error: 'We could not save that password. Choose a password on the next screen.',
      redirectTo: '/auth/reset-password',
    })
    expect(mockClearPin).not.toHaveBeenCalled()
    expect(mockRecordSet).not.toHaveBeenCalled()
    expect(spy).toHaveBeenCalledWith('[setPasswordFromLink] Auth update error:', 'weak password')
  })
})
