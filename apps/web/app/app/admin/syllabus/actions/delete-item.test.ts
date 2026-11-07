import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { deleteItem } from './delete-item'

// ---- Helpers ---------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'

function mockAdminWithRpcResult(result: { error: { message: string; code?: string } | null }) {
  mockRpc.mockResolvedValue(result)
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: mockFrom, rpc: mockRpc },
    userId: 'admin-1',
  })
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

  describe('soft delete via RPC', () => {
    it.each(['easa_subjects', 'easa_topics', 'easa_subtopics'] as const)(
      'calls soft_delete_syllabus_item for %s and revalidates on success',
      async (table) => {
        mockAdminWithRpcResult({ error: null })

        const result = await deleteItem({ id: VALID_UUID, table })

        expect(result.success).toBe(true)
        expect(mockRpc).toHaveBeenCalledWith('soft_delete_syllabus_item', {
          p_table: table,
          p_id: VALID_UUID,
        })
        expect(mockFrom).not.toHaveBeenCalled()
        expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/syllabus')
      },
    )
  })

  describe('error paths', () => {
    it('maps in_use to a still-in-use message', async () => {
      mockAdminWithRpcResult({ error: { message: 'in_use: 3 live topics' } })

      const result = await deleteItem({ id: VALID_UUID, table: 'easa_subjects' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Cannot delete: this item is still in use')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('maps not_found to an item-not-found message', async () => {
      mockAdminWithRpcResult({ error: { message: 'not_found' } })

      const result = await deleteItem({ id: VALID_UUID, table: 'easa_topics' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Item not found')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('logs and returns a generic message for other failures', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockAdminWithRpcResult({ error: { message: 'boom' } })

      const result = await deleteItem({ id: VALID_UUID, table: 'easa_topics' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Could not delete syllabus item')
      expect(consoleSpy).toHaveBeenCalled()
      expect(mockRevalidatePath).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
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
