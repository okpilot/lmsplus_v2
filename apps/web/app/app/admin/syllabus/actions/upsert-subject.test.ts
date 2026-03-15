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

const VALID_UUID = '00000000-0000-0000-0000-000000000001'

function buildChain(leafResult: { error: { message: string; code?: string } | null }) {
  // Single chain that supports both sort_order query and insert/update
  const chain = {
    insert: vi.fn().mockResolvedValue(leafResult),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(leafResult),
    }),
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { sort_order: 5 }, error: null }),
        }),
      }),
    }),
  }
  return chain
}

function mockAdminWithResult(leafResult: { error: { message: string; code?: string } | null }) {
  const chain = buildChain(leafResult)
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
