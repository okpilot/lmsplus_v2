import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockUpdateUser, mockSignIn, mockFrom, mockRevalidatePath } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockUpdateUser: vi.fn(),
    mockSignIn: vi.fn(),
    mockFrom: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }),
)

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser, updateUser: mockUpdateUser, signInWithPassword: mockSignIn },
    from: mockFrom,
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

// ---- Subject under test ---------------------------------------------------

import { changePassword, updateDisplayName } from './actions'

// ---- Helpers ---------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: USER_ID, email: 'test@example.com' } },
    error: null,
  })
}

function buildUpdateChain({
  error = null,
  data = [{ id: USER_ID }],
}: {
  error?: { message: string } | null
  data?: { id: string }[]
} = {}) {
  mockFrom.mockReturnValue({
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: error ? null : data, error }),
      }),
    }),
  })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateDisplayName', () => {
  describe('input validation (runs before auth)', () => {
    it('returns failure when fullName is missing', async () => {
      const result = await updateDisplayName({})

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBeTruthy()
    })

    it('returns failure when fullName is empty', async () => {
      const result = await updateDisplayName({ fullName: '' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Name is required')
    })

    it('returns failure when fullName is whitespace only', async () => {
      const result = await updateDisplayName({ fullName: '   ' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Name is required')
    })

    it('returns failure when fullName exceeds 200 characters', async () => {
      const longName = 'A'.repeat(201)

      const result = await updateDisplayName({ fullName: longName })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Name is too long')
    })

    it('returns failure when raw input is not an object', async () => {
      const result = await updateDisplayName('Alice')

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBeTruthy()
    })
  })

  describe('auth guard', () => {
    it('returns failure when auth returns an error', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      })

      const result = await updateDisplayName({ fullName: 'Alice' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Not authenticated')
    })

    it('returns failure when no user is in the session', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      const result = await updateDisplayName({ fullName: 'Alice' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Not authenticated')
    })
  })

  describe('happy path', () => {
    it('updates full_name on the users table and revalidates /app', async () => {
      mockAuthenticatedUser()
      buildUpdateChain()

      const result = await updateDisplayName({ fullName: 'Alice Pilot' })

      expect(result.success).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('users')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app')
    })

    it('trims leading and trailing whitespace from fullName before saving', async () => {
      mockAuthenticatedUser()
      // Capture the update call argument to verify trimmed value is written
      let updatedPayload: Record<string, unknown> | undefined
      mockFrom.mockReturnValue({
        update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          updatedPayload = payload
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: [{ id: USER_ID }], error: null }),
            }),
          }
        }),
      })

      const result = await updateDisplayName({ fullName: '  Alice Pilot  ' })

      expect(result.success).toBe(true)
      expect(updatedPayload?.full_name).toBe('Alice Pilot')
    })

    it('accepts a name that is exactly 200 characters', async () => {
      mockAuthenticatedUser()
      buildUpdateChain()
      const exactName = 'B'.repeat(200)

      const result = await updateDisplayName({ fullName: exactName })

      expect(result.success).toBe(true)
    })
  })

  describe('zero-row check', () => {
    it('returns failure when no row was updated (profile not found or RLS block)', async () => {
      mockAuthenticatedUser()
      buildUpdateChain({ data: [] })

      const result = await updateDisplayName({ fullName: 'Alice' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Profile not found')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('database error', () => {
    it('returns a sanitized failure message when the DB update fails', async () => {
      mockAuthenticatedUser()
      buildUpdateChain({ error: { message: 'connection timeout' } })

      const result = await updateDisplayName({ fullName: 'Alice' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to update name')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })
})

describe('changePassword', () => {
  const validInput = { currentPassword: 'oldpass123', password: 'newpass123' }

  describe('input validation', () => {
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

  describe('current password verification', () => {
    it('returns failure when current password is wrong', async () => {
      mockAuthenticatedUser()
      mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })

      const result = await changePassword(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Current password is incorrect')
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
