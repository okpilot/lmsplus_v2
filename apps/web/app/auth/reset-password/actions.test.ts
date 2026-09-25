import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockGetUser, mockUpdateUser, mockSignOut, mockClearTempPassword } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockSignOut: vi.fn(),
  mockClearTempPassword: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser, updateUser: mockUpdateUser, signOut: mockSignOut },
  }),
}))

vi.mock('@/lib/auth/temp-password', () => ({
  clearTempPassword: (...args: unknown[]) => mockClearTempPassword(...args),
}))

// ---- Subject under test -------------------------------------------------------

import { resetOwnPassword } from './actions'

// ---- Helpers ------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000002'
const validInput = { password: 'newpassword123', confirmPassword: 'newpassword123' }

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockSignOut.mockResolvedValue({})
  mockClearTempPassword.mockResolvedValue({ success: true })
})

describe('resetOwnPassword', () => {
  describe('input validation', () => {
    it('returns a non-session failure when password is too short', async () => {
      const result = await resetOwnPassword({ password: 'ab', confirmPassword: 'ab' })

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.isSessionMissing).toBe(false)
      expect(result.message).toBe('Password must be at least 6 characters')
      expect(mockGetUser).not.toHaveBeenCalled()
    })

    it('returns a non-session failure when passwords do not match', async () => {
      const result = await resetOwnPassword({ password: 'password123', confirmPassword: 'nope' })

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.isSessionMissing).toBe(false)
      expect(result.message).toBe('Passwords do not match')
    })
  })

  describe('missing session', () => {
    it('returns isSessionMissing true with the expired-link message when there is no user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      const result = await resetOwnPassword(validInput)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.isSessionMissing).toBe(true)
      expect(result.message).toBe('Your reset link has expired. Please request a new one.')
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('returns isSessionMissing true when getUser errors', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } })

      const result = await resetOwnPassword(validInput)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.isSessionMissing).toBe(true)
    })
  })

  describe('updateUser failure', () => {
    it('maps a "session missing" auth error to isSessionMissing true', async () => {
      mockAuthenticatedUser()
      mockUpdateUser.mockResolvedValue({ error: { message: 'Auth session missing!' } })

      const result = await resetOwnPassword(validInput)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.isSessionMissing).toBe(true)
      expect(result.message).toBe('Your reset link has expired. Please request a new one.')
      expect(mockClearTempPassword).not.toHaveBeenCalled()
    })

    it('returns a generic failure for other auth errors', async () => {
      mockAuthenticatedUser()
      mockUpdateUser.mockResolvedValue({ error: { message: 'password too weak' } })

      const result = await resetOwnPassword(validInput)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.isSessionMissing).toBe(false)
      expect(result.message).toBe('Unable to update password. Please try again.')
    })
  })

  describe('happy path', () => {
    it('clears the temp-password flag then signs out on success', async () => {
      mockAuthenticatedUser()
      mockUpdateUser.mockResolvedValue({ error: null })

      const result = await resetOwnPassword(validInput)

      expect(result).toEqual({ ok: true })
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
      expect(mockClearTempPassword).toHaveBeenCalledWith(USER_ID)
      expect(mockSignOut).toHaveBeenCalled()
    })

    it('asks to retry with a different password and keeps the session when finishing the update fails', async () => {
      mockAuthenticatedUser()
      mockUpdateUser.mockResolvedValue({ error: null })
      mockClearTempPassword.mockResolvedValue({ success: false })

      const result = await resetOwnPassword(validInput)

      expect(result).toEqual({
        ok: false,
        isSessionMissing: false,
        message:
          'Your password could not be fully updated. Please try again with a different password.',
      })
      expect(mockSignOut).not.toHaveBeenCalled()
    })
  })
})
