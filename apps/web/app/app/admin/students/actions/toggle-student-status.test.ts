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

import { toggleStudentStatus } from './toggle-student-status'

// ---- Helpers ---------------------------------------------------------------

const ADMIN_ID = '00000000-0000-4000-a000-000000000001'
const STUDENT_ID = '00000000-0000-4000-a000-000000000002'

const VALID_INPUT = { id: STUDENT_ID }

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: ADMIN_ID, organizationId: 'org-1' })
}

function buildFetchChain({
  fetchError = null,
  deletedAt = null,
}: {
  fetchError?: { message: string; code?: string } | null
  deletedAt?: string | null
} = {}) {
  const updateChain = {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: fetchError ? null : { id: STUDENT_ID, deleted_at: deletedAt },
            error: fetchError,
          }),
        }),
      }),
    }),
  }

  mockFrom.mockReturnValue(updateChain)
  return updateChain
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('toggleStudentStatus', () => {
  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await toggleStudentStatus({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when id is not a valid UUID', async () => {
      const result = await toggleStudentStatus({ id: 'not-a-uuid' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('self-deactivation guard', () => {
    it('returns failure when admin attempts to deactivate their own account', async () => {
      mockRequireAdmin.mockResolvedValue({
        supabase: {},
        userId: STUDENT_ID,
        organizationId: 'org-1',
      })

      const result = await toggleStudentStatus({ id: STUDENT_ID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Cannot deactivate your own account')
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })

  describe('student not found', () => {
    it('returns failure when student does not exist (PGRST116)', async () => {
      mockAdmin()
      buildFetchChain({ fetchError: { message: 'no rows', code: 'PGRST116' } })

      const result = await toggleStudentStatus(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Student not found')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns a generic failure when fetching the student fails with a non-404 error', async () => {
      mockAdmin()
      buildFetchChain({ fetchError: { message: 'connection reset', code: 'PGRST500' } })

      const result = await toggleStudentStatus(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to update student status')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('deactivation path (deleted_at is null)', () => {
    it('bans the auth user and soft-deletes the student, then revalidates', async () => {
      mockAdmin()
      buildFetchChain({ deletedAt: null })
      mockUpdateUserById.mockResolvedValue({ error: null })

      const result = await toggleStudentStatus(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockUpdateUserById).toHaveBeenCalledWith(STUDENT_ID, { ban_duration: '876600h' })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    })

    it('returns failure when banning the auth user fails (DB not touched)', async () => {
      mockAdmin()
      buildFetchChain({ deletedAt: null })
      mockUpdateUserById.mockResolvedValue({ error: { message: 'ban failed' } })

      const result = await toggleStudentStatus(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to deactivate student')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure and rolls back ban when the soft-delete update fails', async () => {
      mockAdmin()
      const chain = buildFetchChain({ deletedAt: null })
      mockUpdateUserById.mockResolvedValue({ error: null })
      chain.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'db error' } }),
        }),
      })

      const result = await toggleStudentStatus(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to deactivate student')
      // Auth ban was called first, then rollback unban after DB failure
      expect(mockUpdateUserById).toHaveBeenCalledTimes(2)
    })
  })

  describe('reactivation path (deleted_at is set)', () => {
    it('unbans the auth user and clears deleted_at, then revalidates', async () => {
      mockAdmin()
      buildFetchChain({ deletedAt: '2026-01-01T00:00:00Z' })
      mockUpdateUserById.mockResolvedValue({ error: null })

      const result = await toggleStudentStatus(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockUpdateUserById).toHaveBeenCalledWith(STUDENT_ID, { ban_duration: 'none' })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    })

    it('returns failure when unbanning the auth user fails (DB not touched)', async () => {
      mockAdmin()
      buildFetchChain({ deletedAt: '2026-01-01T00:00:00Z' })
      mockUpdateUserById.mockResolvedValue({ error: { message: 'unban failed' } })

      const result = await toggleStudentStatus(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to reactivate student')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure and rolls back unban when the reactivation update fails', async () => {
      mockAdmin()
      const chain = buildFetchChain({ deletedAt: '2026-01-01T00:00:00Z' })
      mockUpdateUserById.mockResolvedValue({ error: null })
      chain.update.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'db error' } }),
        }),
      })

      const result = await toggleStudentStatus(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to reactivate student')
      // Auth unban was called first, then rollback re-ban after DB failure
      expect(mockUpdateUserById).toHaveBeenCalledTimes(2)
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(toggleStudentStatus(VALID_INPUT)).rejects.toThrow(
        'Forbidden: admin role required',
      )
    })
  })
})
