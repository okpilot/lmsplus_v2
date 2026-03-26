import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockUpdateUserById = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({
  adminClient: {
    from: mockFrom,
    auth: { admin: { updateUserById: mockUpdateUserById } },
  },
}))

// ---- Subject under test ---------------------------------------------------

import { resetStudentPassword } from './reset-student-password'

// ---- Helpers ---------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'

const VALID_INPUT = {
  id: VALID_UUID,
  temporary_password: 'NewPass1',
}

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'admin-1', organizationId: 'org-1' })
}

function buildFetchChain({
  fetchError = null,
  found = true,
}: {
  fetchError?: { message: string; code?: string } | null
  found?: boolean
} = {}) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: fetchError || !found ? null : { id: VALID_UUID },
              error: fetchError,
            }),
          }),
        }),
      }),
    }),
  })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('resetStudentPassword', () => {
  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await resetStudentPassword({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when id is not a valid UUID', async () => {
      const result = await resetStudentPassword({ ...VALID_INPUT, id: 'not-a-uuid' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when temporary_password is shorter than 6 characters', async () => {
      const result = await resetStudentPassword({ ...VALID_INPUT, temporary_password: 'abc' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('happy path', () => {
    it('resets the password and revalidates on success', async () => {
      mockAdmin()
      buildFetchChain()
      mockUpdateUserById.mockResolvedValue({ error: null })

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockUpdateUserById).toHaveBeenCalledWith(
        VALID_UUID,
        expect.objectContaining({
          password: VALID_INPUT.temporary_password,
          user_metadata: { must_change_password: true },
        }),
      )
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    })
  })

  describe('student lookup', () => {
    it('returns failure when student is not found (PGRST116)', async () => {
      mockAdmin()
      buildFetchChain({ fetchError: { message: 'no rows', code: 'PGRST116' } })

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Student not found')
      expect(mockUpdateUserById).not.toHaveBeenCalled()
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns a generic failure when fetching the student fails with a non-404 error', async () => {
      mockAdmin()
      buildFetchChain({ fetchError: { message: 'connection reset', code: 'PGRST500' } })

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to reset password')
      expect(mockUpdateUserById).not.toHaveBeenCalled()
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure when the fetched student data is null without an error', async () => {
      mockAdmin()
      buildFetchChain({ found: false })

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Student not found')
      expect(mockUpdateUserById).not.toHaveBeenCalled()
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth user password update', () => {
    it('returns a generic failure when the auth password update fails', async () => {
      mockAdmin()
      buildFetchChain()
      mockUpdateUserById.mockResolvedValue({ error: { message: 'update failed' } })

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to reset password')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(resetStudentPassword(VALID_INPUT)).rejects.toThrow(
        'Forbidden: admin role required',
      )
    })
  })
})
