import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

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
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    userId: 'admin-1',
    organizationId: 'org-1',
  })
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

  describe('course enrolments', () => {
    const COURSE_ID = 'c0a5e000-0000-4000-8000-000000000002'

    it('calls set_user_enrolments for a student when course_ids is provided', async () => {
      mockAdmin()
      buildUpdateChain()
      mockRpc.mockResolvedValue({ error: null })

      const result = await updateStudent({ ...VALID_INPUT, course_ids: [COURSE_ID] })

      expect(mockRpc).toHaveBeenCalledWith('set_user_enrolments', {
        p_user_id: VALID_UUID,
        p_course_ids: [COURSE_ID],
      })
      expect(result.success).toBe(true)
    })

    it('calls set_user_enrolments with an empty array to clear all courses', async () => {
      mockAdmin()
      buildUpdateChain()
      mockRpc.mockResolvedValue({ error: null })

      await updateStudent({ ...VALID_INPUT, course_ids: [] })

      expect(mockRpc).toHaveBeenCalledWith('set_user_enrolments', {
        p_user_id: VALID_UUID,
        p_course_ids: [],
      })
    })

    it('does not call the RPC when course_ids is omitted', async () => {
      mockAdmin()
      buildUpdateChain()

      await updateStudent(VALID_INPUT)

      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('calls set_user_enrolments for an instructor when course_ids is provided', async () => {
      mockAdmin()
      buildUpdateChain()
      mockRpc.mockResolvedValue({ error: null })

      await updateStudent({ ...VALID_INPUT, role: 'instructor', course_ids: [COURSE_ID] })

      expect(mockRpc).toHaveBeenCalledWith('set_user_enrolments', {
        p_user_id: VALID_UUID,
        p_course_ids: [COURSE_ID],
      })
    })

    it('returns a courses-not-saved failure when the RPC fails', async () => {
      mockAdmin()
      buildUpdateChain()
      mockRpc.mockResolvedValue({ error: { message: 'course_not_found' } })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await updateStudent({ ...VALID_INPUT, course_ids: [COURSE_ID] })

      expect(result).toEqual({
        success: false,
        error: 'Student updated, but courses were not saved',
      })
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
