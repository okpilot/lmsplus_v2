import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockUpdateUser, mockSignIn, mockRpc, mockClearTempPassword } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockUpdateUser: vi.fn(),
    mockSignIn: vi.fn(),
    mockRpc: vi.fn(),
    mockClearTempPassword: vi.fn(),
  }),
)

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser, updateUser: mockUpdateUser, signInWithPassword: mockSignIn },
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/auth/temp-password', () => ({
  clearTempPassword: (...args: unknown[]) => mockClearTempPassword(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { changePassword } from './password-actions'

// ---- Helpers ---------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: USER_ID, email: 'test@example.com' } },
    error: null,
  })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockRpc.mockResolvedValue({ error: null })
  mockClearTempPassword.mockResolvedValue({ success: true })
})

describe('changePassword', () => {
  const validInput = { currentPassword: 'oldpass123', password: 'newpass123' }

  describe('input validation', () => {
    afterEach(() => {
      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('returns failure when currentPassword is missing', async () => {
      const result = await changePassword({ password: 'newpass123' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBeTruthy()
    })

    it('returns failure when password is too short', async () => {
      const result = await changePassword({ currentPassword: 'old', password: '12345' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Password must be at least 6 characters')
    })
  })

  describe('auth guard', () => {
    it('returns failure when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      const result = await changePassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Not authenticated')
    })
  })

  describe('email guard', () => {
    it('returns failure when user has no email', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: USER_ID, email: null } },
        error: null,
      })

      const result = await changePassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('No email associated with account')
    })
  })

  describe('current password verification', () => {
    it('returns failure when current password is wrong', async () => {
      mockAuthenticatedUser()
      mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })

      const result = await changePassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Current password is incorrect')
      expect(mockClearTempPassword).not.toHaveBeenCalled()
    })
  })

  describe('happy path', () => {
    it('verifies current password then updates via Supabase Auth', async () => {
      mockAuthenticatedUser()
      mockSignIn.mockResolvedValue({ error: null })
      mockUpdateUser.mockResolvedValue({ error: null })

      const result = await changePassword(validInput)

      expect(result.success).toBe(true)
      expect(mockSignIn).toHaveBeenCalledWith({ email: 'test@example.com', password: 'oldpass123' })
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass123' })
    })

    it('clears the temp-password flag after a successful password change', async () => {
      mockAuthenticatedUser()
      mockSignIn.mockResolvedValue({ error: null })
      mockUpdateUser.mockResolvedValue({ error: null })

      await changePassword(validInput)

      expect(mockClearTempPassword).toHaveBeenCalledWith(USER_ID)
    })

    it('asks to retry with a different password when finishing the update fails', async () => {
      mockAuthenticatedUser()
      mockSignIn.mockResolvedValue({ error: null })
      mockUpdateUser.mockResolvedValue({ error: null })
      mockClearTempPassword.mockResolvedValue({ success: false })

      const result = await changePassword(validInput)

      expect(result).toEqual({
        success: false,
        error:
          'Your password could not be fully updated. Please try again with a different password.',
      })
      expect(mockRpc).not.toHaveBeenCalledWith('record_auth_event', expect.anything())
    })

    it('records a self user.password_changed audit event', async () => {
      mockAuthenticatedUser()
      mockSignIn.mockResolvedValue({ error: null })
      mockUpdateUser.mockResolvedValue({ error: null })

      await changePassword(validInput)

      expect(mockRpc).toHaveBeenCalledWith('record_auth_event', {
        p_event_type: 'user.password_changed',
        p_resource_id: USER_ID,
      })
    })

    it('still succeeds when the audit event write fails (best-effort)', async () => {
      mockAuthenticatedUser()
      mockSignIn.mockResolvedValue({ error: null })
      mockUpdateUser.mockResolvedValue({ error: null })
      mockRpc.mockResolvedValue({ error: { message: 'audit insert failed' } })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await changePassword(validInput)

      expect(result.success).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[changePassword] Audit event failed:',
        'audit insert failed',
      )
      consoleSpy.mockRestore()
    })
  })

  describe('error handling', () => {
    it('returns session-specific message when session error occurs', async () => {
      mockAuthenticatedUser()
      mockSignIn.mockResolvedValue({ error: null })
      mockUpdateUser.mockResolvedValue({
        error: { message: 'Auth session missing' },
      })

      const result = await changePassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Session expired. Please sign in again.')
      expect(mockClearTempPassword).not.toHaveBeenCalled()
    })

    it('returns generic message for other auth errors', async () => {
      mockAuthenticatedUser()
      mockSignIn.mockResolvedValue({ error: null })
      mockUpdateUser.mockResolvedValue({
        error: { message: 'password too weak' },
      })

      const result = await changePassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Unable to update password. Please try again.')
    })
  })
})
