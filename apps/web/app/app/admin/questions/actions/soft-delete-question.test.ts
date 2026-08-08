import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
// The action writes through the service-role client (RLS cannot express this
// soft-delete — see the action's JSDoc), so the mock target is @repo/db/admin,
// NOT the client returned by requireAdmin().
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

// ---- Subject under test ---------------------------------------------------

import { softDeleteQuestion } from './soft-delete-question'

// ---- Helpers ---------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'
const ADMIN_ID = 'admin-user-1'
const ORG_ID = 'org-1'

type LeafResult =
  | { data: Array<{ id: string }>; error: null }
  | { data: null; error: { message: string; code?: string } }

/**
 * Mirrors the production chain shape:
 *   .update().eq('id').eq('organization_id').is('deleted_at').select('id')
 * Each `eq`/`is` call is captured so tests can assert the filters that replace
 * the RLS guarantees the service-role client bypasses.
 */
function buildChain(leafResult: LeafResult) {
  const select = vi.fn().mockResolvedValue(leafResult)
  const is = vi.fn().mockReturnValue({ select })
  const eqOrg = vi.fn().mockReturnValue({ is })
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg })
  const update = vi.fn().mockReturnValue({ eq: eqId })
  return { update, eqId, eqOrg, is, select }
}

function mockAdminWithResult(leafResult: LeafResult) {
  const chain = buildChain(leafResult)
  mockFrom.mockReturnValue({ update: chain.update })
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: vi.fn() },
    userId: ADMIN_ID,
    organizationId: ORG_ID,
  })
  return chain
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
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
      expect(updateArg).toMatchObject({ deleted_by: ADMIN_ID })
      expect(typeof updateArg.deleted_at).toBe('string')

      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/questions')
    })

    it('restricts the delete to the requested question inside the caller’s own organisation', async () => {
      // The service-role client bypasses RLS, so these two filters are the only
      // thing standing between an admin and another org's question. If either is
      // dropped, this assertion is what fails.
      const chain = mockAdminWithResult({ data: [{ id: VALID_UUID }], error: null })

      await softDeleteQuestion({ id: VALID_UUID })

      expect(chain.eqId).toHaveBeenCalledWith('id', VALID_UUID)
      expect(chain.eqOrg).toHaveBeenCalledWith('organization_id', ORG_ID)
    })

    it('skips questions that are already deleted so the original deleter is preserved', async () => {
      const chain = mockAdminWithResult({ data: [{ id: VALID_UUID }], error: null })

      await softDeleteQuestion({ id: VALID_UUID })

      expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    })
  })

  describe('error paths', () => {
    it('returns a generic error and logs the raw cause server-side when the DB update fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockAdminWithResult({ data: null, error: { message: 'update failed' } })

      const result = await softDeleteQuestion({ id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      // Raw DB error must not reach the client (code-style.md §5 / OWASP A10).
      expect(result.error).toBe('Failed to delete question')
      expect(errorSpy).toHaveBeenCalledWith('[softDeleteQuestion] DB error:', 'update failed')
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

    it('does not touch the database when the caller is not an admin', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(softDeleteQuestion({ id: VALID_UUID })).rejects.toThrow()

      // requireAdmin must gate the service-role write — reaching the DB before
      // the guard resolves would mean an unauthenticated caller can mutate rows.
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })
})
