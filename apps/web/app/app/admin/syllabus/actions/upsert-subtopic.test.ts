import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { upsertSubtopic } from './upsert-subtopic'

// ---- Helpers ---------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'
const TOPIC_UUID = '00000000-0000-4000-a000-000000000002'

function buildChain(leafResult: { error: { message: string; code?: string } | null }) {
  const chain = {
    insert: vi.fn().mockResolvedValue(leafResult),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(leafResult),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { sort_order: 5 }, error: null }),
          }),
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

describe('upsertSubtopic', () => {
  const validInput = {
    topic_id: TOPIC_UUID,
    code: '010-01-01',
    name: 'ICAO and its aims',
    sort_order: 1,
  }

  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await upsertSubtopic({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when topic_id is not a valid UUID', async () => {
      const result = await upsertSubtopic({ ...validInput, topic_id: 'not-a-uuid' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when code exceeds max length', async () => {
      const result = await upsertSubtopic({ ...validInput, code: 'X'.repeat(31) })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when sort_order is negative', async () => {
      const result = await upsertSubtopic({ ...validInput, sort_order: -1 })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('insert path (no id)', () => {
    it('inserts a new subtopic and revalidates on success', async () => {
      mockAdminWithResult({ error: null })

      const result = await upsertSubtopic(validInput)

      expect(result.success).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('easa_subtopics')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/syllabus')
    })

    it('returns failure when insert fails with a generic DB error', async () => {
      mockAdminWithResult({ error: { message: 'constraint violation' } })

      const result = await upsertSubtopic(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('constraint violation')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns a duplicate-code message when insert violates unique constraint', async () => {
      mockAdminWithResult({ error: { message: 'duplicate key', code: '23505' } })

      const result = await upsertSubtopic(validInput)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('A subtopic with this code already exists in this topic')
    })
  })

  describe('update path (with id)', () => {
    it('updates an existing subtopic and revalidates on success', async () => {
      const chain = mockAdminWithResult({ error: null })

      const result = await upsertSubtopic({ ...validInput, id: VALID_UUID })

      expect(result.success).toBe(true)
      expect(chain.update).toHaveBeenCalled()
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/syllabus')
    })

    it('returns failure when update fails with a DB error', async () => {
      mockAdminWithResult({ error: { message: 'update error' } })

      const result = await upsertSubtopic({ ...validInput, id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('update error')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(upsertSubtopic(validInput)).rejects.toThrow('Forbidden: admin role required')
    })
  })
})
