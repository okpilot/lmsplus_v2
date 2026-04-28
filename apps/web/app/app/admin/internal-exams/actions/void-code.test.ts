import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@/lib/supabase-rpc', () => ({ rpc: mockRpc }))

// ---- Subject under test ---------------------------------------------------

import { voidInternalExamCode } from './void-code'

// ---- Helpers ---------------------------------------------------------------

const CODE_ID = '00000000-0000-4000-a000-000000000001'
const SESSION_ID = '00000000-0000-4000-a000-000000000002'
const SUPABASE = { __marker: 'supabase' }

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: SUPABASE,
    organizationId: 'org-001',
    userId: 'admin-001',
  })
}

const VALID_INPUT = { codeId: CODE_ID, reason: 'Student requested rescheduling' }

const RPC_OK_NO_SESSION = { code_id: CODE_ID, session_id: null, session_ended: false }
const RPC_OK_WITH_SESSION = {
  code_id: CODE_ID,
  session_id: SESSION_ID,
  session_ended: true,
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('voidInternalExamCode', () => {
  describe('input validation', () => {
    it('rejects missing fields', async () => {
      const result = await voidInternalExamCode({})
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Invalid input')
    })

    it('rejects non-uuid codeId', async () => {
      const result = await voidInternalExamCode({ codeId: 'bad', reason: 'r' })
      expect(result.success).toBe(false)
    })

    it('rejects empty reason', async () => {
      const result = await voidInternalExamCode({ codeId: CODE_ID, reason: '' })
      expect(result.success).toBe(false)
    })

    it('rejects reason longer than 500 chars', async () => {
      const result = await voidInternalExamCode({
        codeId: CODE_ID,
        reason: 'x'.repeat(501),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('RPC call', () => {
    it('calls void_internal_exam_code with correct parameters', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: [RPC_OK_NO_SESSION], error: null })

      await voidInternalExamCode(VALID_INPUT)

      expect(mockRpc).toHaveBeenCalledWith(SUPABASE, 'void_internal_exam_code', {
        p_code_id: CODE_ID,
        p_reason: 'Student requested rescheduling',
      })
    })

    it('returns success with null sessionId when code was unconsumed', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: [RPC_OK_NO_SESSION], error: null })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.codeId).toBe(CODE_ID)
        expect(result.sessionId).toBeNull()
        expect(result.sessionEnded).toBe(false)
      }
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    })

    it('returns success with sessionId and sessionEnded when active session was terminated', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: [RPC_OK_WITH_SESSION], error: null })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.sessionId).toBe(SESSION_ID)
        expect(result.sessionEnded).toBe(true)
      }
    })

    it('handles RPC returning a single object (not an array)', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: RPC_OK_NO_SESSION, error: null })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(result.success).toBe(true)
    })

    it('returns "Failed to void internal exam code" when RPC returns null data', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: null })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Failed to void internal exam code')
    })

    it('returns "Failed to void internal exam code" when RPC returns malformed shape', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: [{ wrong: 'shape' }], error: null })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(result.success).toBe(false)
    })
  })

  describe('error code mapping', () => {
    it('maps cannot_void_finished_attempt', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'cannot_void_finished_attempt' },
      })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Cannot void a finished attempt — record is final')
      }
    })

    it('maps code_not_found', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'code_not_found' } })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Code not found')
    })

    it('maps not_admin', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'not_admin' } })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Admin permission required')
    })

    it('returns generic message for unrecognized RPC error', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'connection lost' } })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Failed to void internal exam code')
    })

    it('does not revalidate on RPC error', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'code_not_found' } })
      await voidInternalExamCode(VALID_INPUT)
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates auth errors from requireAdmin', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Not admin'))

      await expect(voidInternalExamCode(VALID_INPUT)).rejects.toThrow('Not admin')
    })
  })
})
