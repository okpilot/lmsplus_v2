import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({
  adminClient: { from: mockFrom },
}))

// ---- Subject under test ---------------------------------------------------

import { updateStudent } from './update-student'

// ---- Helpers ---------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'

const VALID_INPUT = {
  id: VALID_UUID,
  full_name: 'Jane Smith',
  role: 'student' as const,
}

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'admin-1', organizationId: 'org-1' })
}

function buildUpdateChain({
  error = null,
  data = [{ id: VALID_UUID }],
}: {
  error?: { message: string } | null
  data?: { id: string }[]
} = {}) {
  mockFrom.mockReturnValue({
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: error ? null : data, error }),
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

describe('updateStudent', () => {
  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await updateStudent({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when id is not a valid UUID', async () => {
      const result = await updateStudent({ ...VALID_INPUT, id: 'not-a-uuid' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when full_name is empty after trimming', async () => {
      const result = await updateStudent({ ...VALID_INPUT, full_name: '   ' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when role is not a valid enum value', async () => {
      const result = await updateStudent({ ...VALID_INPUT, role: 'superadmin' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('happy path', () => {
    it('updates the student profile and revalidates on success', async () => {
      mockAdmin()
      buildUpdateChain()

      const result = await updateStudent(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('users')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    })
  })

  describe('not found', () => {
    it('returns failure when no student row was updated (soft-deleted or wrong id)', async () => {
      mockAdmin()
      buildUpdateChain({ data: [] })

      const result = await updateStudent(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Student not found')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('database error', () => {
    it('returns a sanitized failure when the database update fails', async () => {
      mockAdmin()
      buildUpdateChain({ error: { message: 'connection timeout' } })

      const result = await updateStudent(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to update student')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(updateStudent(VALID_INPUT)).rejects.toThrow('Forbidden: admin role required')
    })
  })
})
