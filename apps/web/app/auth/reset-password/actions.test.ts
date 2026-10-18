import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockGetUser, mockUpdateUser, mockSignOut, mockClearMarker, mockRecordAuthEvent } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockUpdateUser: vi.fn(),
    mockSignOut: vi.fn(),
    mockClearMarker: vi.fn(),
    mockRecordAuthEvent: vi.fn(),
  }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser, updateUser: mockUpdateUser, signOut: mockSignOut },
  }),
}))

vi.mock('@/lib/audit/record-auth-event', () => ({
  recordAuthEvent: (...args: unknown[]) => mockRecordAuthEvent(...args),
}))

vi.mock('@/lib/auth/password-pending-marker', () => ({
  clearPasswordPendingMarker: (...args: unknown[]) => mockClearMarker(...args),
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
  mockRecordAuthEvent.mockResolvedValue(undefined)
  mockClearMarker.mockResolvedValue(undefined)
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
      expect(result.message).toBe('Your reset session has expired. Please request a new code.')
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
      expect(result.message).toBe('Your reset session has expired. Please request a new code.')
      expect(mockClearMarker).not.toHaveBeenCalled()
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
    it('clears the pending-password marker then signs out on success', async () => {
      mockAuthenticatedUser()
      mockUpdateUser.mockResolvedValue({ error: null })

      const result = await resetOwnPassword(validInput)

      expect(result).toEqual({ ok: true })
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
      expect(mockClearMarker).toHaveBeenCalledWith(USER_ID)
      expect(mockSignOut).toHaveBeenCalled()
    })

    it('records a self user.password_changed audit event on success', async () => {
      mockAuthenticatedUser()
      mockUpdateUser.mockResolvedValue({ error: null })

      await resetOwnPassword(validInput)

      expect(mockRecordAuthEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'user.password_changed', resourceId: USER_ID }),
      )
    })

    it('still succeeds when the marker clear is a silent no-op', async () => {
      mockAuthenticatedUser()
      mockUpdateUser.mockResolvedValue({ error: null })

      const result = await resetOwnPassword(validInput)

      expect(result).toEqual({ ok: true })
      expect(mockSignOut).toHaveBeenCalled()
    })

    it('still succeeds when the sign-out fails, after logging it', async () => {
      mockAuthenticatedUser()
      mockUpdateUser.mockResolvedValue({ error: null })
      mockSignOut.mockResolvedValue({ error: { message: 'gotrue unavailable' } })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await resetOwnPassword(validInput)

      expect(result).toEqual({ ok: true })
      expect(consoleSpy).toHaveBeenCalledWith(
        '[resetOwnPassword] sign-out failed:',
        'gotrue unavailable',
      )
      consoleSpy.mockRestore()
    })
  })
})
