import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { softDeleteQuestion } from './soft-delete-question'

// ---- Helpers ---------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'

type LeafResult =
  | { data: Array<{ id: string }>; error: null }
  | { data: null; error: { message: string; code?: string } }

function buildChain(leafResult: LeafResult) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue(leafResult),
      }),
    }),
  }
}

function mockAdminWithResult(leafResult: LeafResult) {
  const chain = buildChain(leafResult)
  mockFrom.mockReturnValue(chain)
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: mockFrom },
    userId: 'admin-user-1',
  })
  return chain
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('softDeleteQuestion', () => {
  describe('input validation', () => {
    it('returns failure when input is missing the id field', async () => {
      const result = await softDeleteQuestion({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when id is not a valid UUID', async () => {
      const result = await softDeleteQuestion({ id: 'not-a-uuid' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when id is an empty string', async () => {
      const result = await softDeleteQuestion({ id: '' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('happy path', () => {
    it('sets deleted_at and deleted_by and revalidates on success', async () => {
      const chain = mockAdminWithResult({ data: [{ id: VALID_UUID }], error: null })

      const result = await softDeleteQuestion({ id: VALID_UUID })

      expect(result.success).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('questions')

      const updateArg = chain.update.mock.calls[0]?.[0] as {
        deleted_at: string
        deleted_by: string
      }
      expect(updateArg).toMatchObject({ deleted_by: 'admin-user-1' })
      expect(typeof updateArg.deleted_at).toBe('string')

      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/questions')
    })
  })

  describe('error paths', () => {
    it('returns failure when the DB update returns an error', async () => {
      mockAdminWithResult({ data: null, error: { message: 'update failed' } })

      const result = await softDeleteQuestion({ id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('update failed')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure when no row is affected (question not found or inaccessible)', async () => {
      mockAdminWithResult({ data: [], error: null })

      const result = await softDeleteQuestion({ id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Question not found or not accessible')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(softDeleteQuestion({ id: VALID_UUID })).rejects.toThrow(
        'Forbidden: admin role required',
      )
    })
  })
})
