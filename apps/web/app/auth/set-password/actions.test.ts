import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks --------------------------------------------------------------------

const { mockGetUser, mockUpdateUser, mockRpc, mockReadTempPasswordState, mockClearTempPassword } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockUpdateUser: vi.fn(),
    mockRpc: vi.fn(),
    mockReadTempPasswordState: vi.fn(),
    mockClearTempPassword: vi.fn(),
  }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser, updateUser: mockUpdateUser },
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/auth/temp-password', () => ({
  readTempPasswordState: (...args: unknown[]) => mockReadTempPasswordState(...args),
  clearTempPassword: (...args: unknown[]) => mockClearTempPassword(...args),
}))

// ---- Subject under test --------------------------------------------------------

import { setOwnPassword } from './actions'

// ---- Helpers --------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000003'
const validInput = { password: 'newpassword123', confirmPassword: 'newpassword123' }

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRpc.mockResolvedValue({ error: null })
  mockClearTempPassword.mockResolvedValue({ success: true })
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
    it('returns a generic error when reading state throws', async () => {
      mockAuthenticatedUser()
      mockReadTempPasswordState.mockRejectedValue(new Error('db down'))

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Unable to update password. Please try again.')
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('refuses to replace a password when the state is not active', async () => {
      mockAuthenticatedUser()
      mockReadTempPasswordState.mockResolvedValue('none')

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('No temporary password to replace.')
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('refuses to replace an already-expired temp password', async () => {
      mockAuthenticatedUser()
      mockReadTempPasswordState.mockResolvedValue('expired')

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('No temporary password to replace.')
    })
  })

  describe('updateUser failure', () => {
    it('asks for a different password when the new one matches the temporary one, and keeps the flag', async () => {
      mockAuthenticatedUser()
      mockReadTempPasswordState.mockResolvedValue('active')
      mockUpdateUser.mockResolvedValue({ error: { code: 'same_password', message: 'same' } })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Choose a different password.')
      expect(mockClearTempPassword).not.toHaveBeenCalled()
    })

    it('returns a generic error for other updateUser failures', async () => {
      mockAuthenticatedUser()
      mockReadTempPasswordState.mockResolvedValue('active')
      mockUpdateUser.mockResolvedValue({ error: { message: 'password too weak' } })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Unable to update password. Please try again.')
      expect(mockClearTempPassword).not.toHaveBeenCalled()
    })
  })

  describe('clear failure', () => {
    it('asks to retry with a different password when finishing the update fails', async () => {
      mockAuthenticatedUser()
      mockReadTempPasswordState.mockResolvedValue('active')
      mockUpdateUser.mockResolvedValue({ error: null })
      mockClearTempPassword.mockResolvedValue({ success: false })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe(
        'Your password could not be fully updated. Please try again with a different password.',
      )
    })
  })

  describe('happy path', () => {
    it('updates the password, clears the flag, and records an audit event', async () => {
      mockAuthenticatedUser()
      mockReadTempPasswordState.mockResolvedValue('active')
      mockUpdateUser.mockResolvedValue({ error: null })

      const result = await setOwnPassword(validInput)

      expect(result).toEqual({ success: true })
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
      expect(mockClearTempPassword).toHaveBeenCalledWith(USER_ID)
      expect(mockRpc).toHaveBeenCalledWith('record_auth_event', {
        p_event_type: 'user.password_changed',
        p_resource_id: USER_ID,
      })
    })

    it('still succeeds when the audit event write fails (best-effort)', async () => {
      mockAuthenticatedUser()
      mockReadTempPasswordState.mockResolvedValue('active')
      mockUpdateUser.mockResolvedValue({ error: null })
      mockRpc.mockResolvedValue({ error: { message: 'audit insert failed' } })

      const result = await setOwnPassword(validInput)

      expect(result.success).toBe(true)
    })
  })
})
