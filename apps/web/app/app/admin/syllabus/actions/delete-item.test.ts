import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { deleteItem } from './delete-item'

// ---- Helpers ---------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'

function mockAdminWithDeleteResult(result: {
  error: { message: string; code?: string } | null
}) {
  mockFrom.mockReturnValue({
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(result),
    }),
  })
  mockRequireAdmin.mockResolvedValue({ supabase: { from: mockFrom }, userId: 'admin-1' })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleteItem', () => {
  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await deleteItem({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when id is not a valid UUID', async () => {
      const result = await deleteItem({ id: 'not-a-uuid', table: 'easa_subjects' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when table is not an allowed value', async () => {
      const result = await deleteItem({ id: VALID_UUID, table: 'questions' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('delete from each allowed table', () => {
    it.each(['easa_subjects', 'easa_topics', 'easa_subtopics'] as const)(
      'deletes from %s and revalidates on success',
      async (table) => {
        mockAdminWithDeleteResult({ error: null })

        const result = await deleteItem({ id: VALID_UUID, table })

        expect(result.success).toBe(true)
        expect(mockFrom).toHaveBeenCalledWith(table)
        expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/syllabus')
      },
    )
  })

  describe('error paths', () => {
    it('returns a referenced-by-questions message when delete violates FK constraint', async () => {
      mockAdminWithDeleteResult({ error: { message: 'FK violation', code: '23503' } })

      const result = await deleteItem({ id: VALID_UUID, table: 'easa_subjects' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Cannot delete: questions reference this item')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns a sanitized error message for other delete failures', async () => {
      mockAdminWithDeleteResult({ error: { message: 'row not found' } })

      const result = await deleteItem({ id: VALID_UUID, table: 'easa_topics' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Could not delete syllabus item')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(deleteItem({ id: VALID_UUID, table: 'easa_subjects' })).rejects.toThrow(
        'Forbidden: admin role required',
      )
    })
  })
})
