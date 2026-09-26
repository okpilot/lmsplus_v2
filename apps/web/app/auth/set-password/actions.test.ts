import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks --------------------------------------------------------------------

const {
  mockGetUser,
  mockUpdateUser,
  mockSignOut,
  mockRpc,
  mockRefuseIfTempPasswordExpired,
  mockClearTempPassword,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockSignOut: vi.fn(),
  mockRpc: vi.fn(),
  mockRefuseIfTempPasswordExpired: vi.fn(),
  mockClearTempPassword: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser, updateUser: mockUpdateUser, signOut: mockSignOut },
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/auth/temp-password', () => ({
  refuseIfTempPasswordExpired: (...args: unknown[]) => mockRefuseIfTempPasswordExpired(...args),
  RETRY_DIFFERENT_PASSWORD_MESSAGE:
    'Your password could not be fully updated. Please try again with a different password.',
  TEMP_PASSWORD_EXPIRED_MESSAGE:
    'Your temporary password has expired. Ask your instructor to send you new login instructions.',
}))

vi.mock('@/lib/auth/temp-password-admin', () => ({
  clearTempPassword: (...args: unknown[]) => mockClearTempPassword(...args),
}))

// ---- Subject under test --------------------------------------------------------

import { setOwnPassword } from './actions'

// ---- Helpers --------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000003'
const EXPIRY = '2026-09-25T00:00:00.000Z'
const validInput = { password: 'newpassword123', confirmPassword: 'newpassword123' }

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRpc.mockResolvedValue({ error: null })
  mockClearTempPassword.mockResolvedValue({ success: true })
  mockSignOut.mockResolvedValue({ error: null })
})

describe('setOwnPassword', () => {
  describe('input validation', () => {
    it('returns failure when password is too short', async () => {
      const result = await setOwnPassword({ password: 'ab', confirmPassword: 'ab' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Password must be at least 6 characters')
      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('returns failure when passwords do not match', async () => {
      const result = await setOwnPassword({ password: 'password123', confirmPassword: 'nope' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Passwords do not match')
    })
  })

  describe('auth guard', () => {
    it('returns failure when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Not authenticated')
    })
  })

  describe('temp-password state guard', () => {
    it('returns a generic error when the state cannot be read', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'error', expiresAt: null })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Unable to update password. Please try again.')
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('refuses to replace a password when the state is not active', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'none', expiresAt: null })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('No temporary password to replace.')
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('refuses an already-expired temp password with the expiry message; the helper already signed out globally', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'expired', expiresAt: null })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe(
        'Your temporary password has expired. Ask your instructor to send you new login instructions.',
      )
      expect(mockUpdateUser).not.toHaveBeenCalled()
      expect(mockRefuseIfTempPasswordExpired).toHaveBeenCalledWith(expect.anything(), USER_ID)
    })
  })

  describe('updateUser failure', () => {
    it('asks for a different password when the new one matches the temporary one, and keeps the flag', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'active', expiresAt: EXPIRY })
      mockUpdateUser.mockResolvedValue({ error: { code: 'same_password', message: 'same' } })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Choose a different password.')
      expect(mockClearTempPassword).not.toHaveBeenCalled()
    })

    it('returns a generic error for other updateUser failures', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'active', expiresAt: EXPIRY })
      mockUpdateUser.mockResolvedValue({ error: { message: 'password too weak' } })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Unable to update password. Please try again.')
      expect(mockClearTempPassword).not.toHaveBeenCalled()
    })
  })

  describe('clear failure', () => {
    it('asks to retry with a different password when finishing the update fails, and still records the change', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'active', expiresAt: EXPIRY })
      mockUpdateUser.mockResolvedValue({ error: null })
      mockClearTempPassword.mockResolvedValue({ success: false })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe(
        'Your password could not be fully updated. Please try again with a different password.',
      )
      expect(mockClearTempPassword).toHaveBeenCalledWith(USER_ID, EXPIRY)
      expect(mockRpc).toHaveBeenCalledWith('record_auth_event', {
        p_event_type: 'user.password_changed',
        p_resource_id: USER_ID,
      })
      expect(mockSignOut).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('updates the password, clears the flag, and records an audit event', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'active', expiresAt: EXPIRY })
      mockUpdateUser.mockResolvedValue({ error: null })

      const result = await setOwnPassword(validInput)

      expect(result).toEqual({ success: true })
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
      expect(mockClearTempPassword).toHaveBeenCalledWith(USER_ID, EXPIRY)
      expect(mockRpc).toHaveBeenCalledWith('record_auth_event', {
        p_event_type: 'user.password_changed',
        p_resource_id: USER_ID,
      })
    })

    it('signs out every other session after clearing the flag', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'active', expiresAt: EXPIRY })
      mockUpdateUser.mockResolvedValue({ error: null })

      await setOwnPassword(validInput)

      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' })
    })

    it('still succeeds when signing out other sessions fails (non-fatal)', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'active', expiresAt: EXPIRY })
      mockUpdateUser.mockResolvedValue({ error: null })
      mockSignOut.mockResolvedValue({ error: { message: 'gotrue unavailable' } })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[setOwnPassword] sign-out others failed:',
        'gotrue unavailable',
      )
      consoleSpy.mockRestore()
    })

    it('still succeeds when the audit event write fails (best-effort)', async () => {
      mockAuthenticatedUser()
      mockRefuseIfTempPasswordExpired.mockResolvedValue({ state: 'active', expiresAt: EXPIRY })
      mockUpdateUser.mockResolvedValue({ error: null })
      mockRpc.mockResolvedValue({ error: { message: 'audit insert failed' } })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(true)
    })
  })
})
