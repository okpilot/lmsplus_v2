import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { upsertSubject } from './upsert-subject'

// ---- Helpers ---------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'

function buildChain(
  leafResult: { error: { message: string; code?: string } | null },
  sortOrderResult: {
    data: { sort_order: number } | null
    error: { message: string; code?: string } | null
  } = {
    data: { sort_order: 5 },
    error: null,
  },
) {
  // Single chain that supports both sort_order query and insert/update
  const chain = {
    insert: vi.fn().mockResolvedValue(leafResult),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(leafResult),
    }),
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(sortOrderResult),
        }),
      }),
    }),
  }
  return chain
}

function mockAdminWithResult(
  leafResult: { error: { message: string; code?: string } | null },
  sortOrderResult?: {
    data: { sort_order: number } | null
    error: { message: string; code?: string } | null
  },
) {
  const chain = buildChain(leafResult, sortOrderResult)
  mockFrom.mockReturnValue(chain)
  mockRequireAdmin.mockResolvedValue({ supabase: { from: mockFrom }, userId: 'admin-1' })
  return chain
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('upsertSubject', () => {
  const validInput = { code: '010', name: 'Air Law', short: 'Air Law', sort_order: 1 }

  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await upsertSubject({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when code exceeds max length', async () => {
      const result = await upsertSubject({ ...validInput, code: 'X'.repeat(11) })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when sort_order is negative', async () => {
      const result = await upsertSubject({ ...validInput, sort_order: -1 })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when id is present but not a valid UUID', async () => {
      const result = await upsertSubject({ ...validInput, id: 'not-a-uuid' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('insert path (no id)', () => {
    it('inserts a new subject and revalidates on success', async () => {
      mockAdminWithResult({ error: null })

      const result = await upsertSubject(validInput)

      expect(result.success).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('easa_subjects')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/syllabus')
    })

    it('returns failure when insert fails with a generic DB error', async () => {
      mockAdminWithResult({ error: { message: 'connection timeout' } })

      const result = await upsertSubject(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('connection timeout')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns a duplicate-code message when insert violates unique constraint', async () => {
      mockAdminWithResult({ error: { message: 'duplicate key', code: '23505' } })

      const result = await upsertSubject(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('A subject with this code already exists')
    })

    it('returns failure when the sort_order lookup returns a real DB error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockAdminWithResult(
        { error: null },
        { data: null, error: { message: 'permission denied', code: '42501' } },
      )

      const result = await upsertSubject(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to create subject')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[upsertSubject] sort_order lookup error:',
        'permission denied',
      )
      expect(mockRevalidatePath).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('succeeds and falls back to sort_order 0 when the table is empty (PGRST116)', async () => {
      mockAdminWithResult(
        { error: null },
        { data: null, error: { message: 'no rows', code: 'PGRST116' } },
      )

      const result = await upsertSubject(validInput)

      expect(result.success).toBe(true)
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/syllabus')
    })
  })

  describe('update path (with id)', () => {
    it('updates an existing subject and revalidates on success', async () => {
      const chain = mockAdminWithResult({ error: null })

      const result = await upsertSubject({ ...validInput, id: VALID_UUID })

      expect(result.success).toBe(true)
      expect(chain.update).toHaveBeenCalled()
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/syllabus')
    })

    it('returns failure when update fails with a DB error', async () => {
      mockAdminWithResult({ error: { message: 'update failed' } })

      const result = await upsertSubject({ ...validInput, id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('update failed')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(upsertSubject(validInput)).rejects.toThrow('Forbidden: admin role required')
    })
  })
})
