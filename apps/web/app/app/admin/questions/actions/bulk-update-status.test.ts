import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { bulkUpdateStatus } from './bulk-update-status'

// ---- Helpers ---------------------------------------------------------------

const UUID_1 = '00000000-0000-4000-a000-000000000001'
const UUID_2 = '00000000-0000-4000-a000-000000000002'

type LeafResult =
  | { data: { id: string }[]; error: null }
  | { data: null; error: { message: string } }

function buildChain(leafResult: LeafResult) {
  return {
    update: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue(leafResult),
        }),
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

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('bulkUpdateStatus', () => {
  describe('input validation', () => {
    it('returns failure when ids array is missing', async () => {
      const result = await bulkUpdateStatus({ status: 'active' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when ids array is empty', async () => {
      const result = await bulkUpdateStatus({ ids: [], status: 'active' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when ids contains a non-UUID value', async () => {
      const result = await bulkUpdateStatus({ ids: ['not-a-uuid'], status: 'active' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when status is an unrecognised value', async () => {
      const result = await bulkUpdateStatus({ ids: [UUID_1], status: 'published' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when status is missing', async () => {
      const result = await bulkUpdateStatus({ ids: [UUID_1] })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when input is not an object', async () => {
      const result = await bulkUpdateStatus(null)
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('happy path', () => {
    it('activates the supplied questions and revalidates', async () => {
      const chain = mockAdminWithResult({ data: [{ id: UUID_1 }], error: null })

      const result = await bulkUpdateStatus({ ids: [UUID_1, UUID_2], status: 'active' })

      expect(result.success).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('questions')

      const updateArg = chain.update.mock.calls[0]?.[0] as {
        status: string
        updated_at: string
      }
      expect(updateArg.status).toBe('active')
      expect(typeof updateArg.updated_at).toBe('string')

      const inArg = chain.update.mock.results[0]?.value.in.mock.calls[0]?.[1] as string[]
      expect(inArg).toEqual([UUID_1, UUID_2])

      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/questions')
    })

    it('deactivates the supplied questions and revalidates', async () => {
      const chain = mockAdminWithResult({ data: [{ id: UUID_1 }], error: null })

      const result = await bulkUpdateStatus({ ids: [UUID_1], status: 'draft' })

      expect(result.success).toBe(true)
      const updateArg = chain.update.mock.calls[0]?.[0] as { status: string }
      expect(updateArg.status).toBe('draft')
    })

    it('accepts up to 100 question ids', async () => {
      mockAdminWithResult({ data: [{ id: UUID_1 }], error: null })
      const ids = Array.from(
        { length: 100 },
        (_, i) => `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`,
      )
      const result = await bulkUpdateStatus({ ids, status: 'active' })
      expect(result.success).toBe(true)
    })
  })

  describe('error paths', () => {
    it('returns failure when the DB update returns an error', async () => {
      mockAdminWithResult({ data: null, error: { message: 'update failed' } })

      const result = await bulkUpdateStatus({ ids: [UUID_1], status: 'active' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('update failed')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure when no rows were updated (all IDs filtered by RLS or deleted)', async () => {
      mockAdminWithResult({ data: [], error: null })

      const result = await bulkUpdateStatus({ ids: [UUID_1, UUID_2], status: 'active' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('No questions were updated')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(bulkUpdateStatus({ ids: [UUID_1], status: 'active' })).rejects.toThrow(
        'Forbidden: admin role required',
      )
    })
  })
})
