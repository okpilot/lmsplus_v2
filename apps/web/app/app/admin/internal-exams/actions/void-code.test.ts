import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockMaybeSingle = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { voidInternalExamCode } from './void-code'

// ---- Helpers ---------------------------------------------------------------

const CODE_ID = '00000000-0000-4000-a000-000000000001'
const SESSION_ID = '00000000-0000-4000-a000-000000000002'
const SUPABASE = {
  __marker: 'supabase',
  rpc: mockRpc,
  from: vi.fn(() => ({
    select: () => ({
      eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: mockMaybeSingle }) }) }),
    }),
  })),
}

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: SUPABASE,
    organizationId: 'org-001',
    userId: 'admin-001',
  })
  mockMaybeSingle.mockResolvedValue({ data: { sitting_entry_id: null }, error: null })
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

    it('rejects whitespace-only reason', async () => {
      const result = await voidInternalExamCode({ codeId: CODE_ID, reason: '  \t\n  ' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Invalid input')
    })

    it('rejects reason longer than 500 chars', async () => {
      const result = await voidInternalExamCode({
        codeId: CODE_ID,
        reason: 'x'.repeat(501),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('sitting code guard', () => {
    it('refuses a sitting code and does not call the RPC', async () => {
      mockAdmin()
      mockMaybeSingle.mockResolvedValue({
        data: {
          sitting_entry_id: 'entry-1',
          voided_at: null,
          consumed_at: null,
          quiz_sessions: null,
        },
        error: null,
      })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(result).toEqual({ success: false, error: 'Manage this sitting code from its sitting' })
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('voids a sitting code whose attempt is still running', async () => {
      mockAdmin()
      mockMaybeSingle.mockResolvedValue({
        data: {
          sitting_entry_id: 'entry-1',
          voided_at: null,
          consumed_at: '2026-04-28T11:00:00.000Z',
          quiz_sessions: { ended_at: null },
        },
        error: null,
      })
      mockRpc.mockResolvedValue({ data: [RPC_OK_NO_SESSION], error: null })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(mockRpc).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
    })

    it('refuses a sitting code whose attempt has ended', async () => {
      mockAdmin()
      mockMaybeSingle.mockResolvedValue({
        data: {
          sitting_entry_id: 'entry-1',
          voided_at: null,
          consumed_at: '2026-04-28T11:00:00.000Z',
          quiz_sessions: { ended_at: '2026-04-28T12:00:00.000Z' },
        },
        error: null,
      })

      const result = await voidInternalExamCode(VALID_INPUT)

      // Not "void it from the sitting": the sitting offers Void only for a waiting or ready entry.
      expect(result).toEqual({
        success: false,
        error: 'Cannot void a finished attempt — record is final',
      })
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('returns a generic error on lookup failure and does not call the RPC', async () => {
      mockAdmin()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'db down' } })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(result).toEqual({ success: false, error: 'Failed to void internal exam code' })
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('calls the RPC for a legacy code', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: [RPC_OK_NO_SESSION], error: null })

      await voidInternalExamCode(VALID_INPUT)

      expect(mockRpc).toHaveBeenCalledTimes(1)
    })

    it('maps the sitting_code RPC error to "Void sitting codes from their sitting"', async () => {
      mockAdmin()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRpc.mockResolvedValue({ data: null, error: { message: 'sitting_code' } })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(result).toEqual({ success: false, error: 'Void sitting codes from their sitting' })
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('fails closed when the row is missing, without calling the RPC', async () => {
      mockAdmin()
      mockMaybeSingle.mockResolvedValue({ data: null, error: null })

      const result = await voidInternalExamCode(VALID_INPUT)

      expect(mockRpc).not.toHaveBeenCalled()
      expect(result).toEqual({ success: false, error: 'Code not found' })
    })
  })

  describe('RPC call', () => {
    it('calls void_internal_exam_code with correct parameters', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: [RPC_OK_NO_SESSION], error: null })

      await voidInternalExamCode(VALID_INPUT)

      expect(mockRpc.mock.contexts[0]).toBe(SUPABASE)
      expect(mockRpc).toHaveBeenCalledWith('void_internal_exam_code', {
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
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        '/app/admin/internal-exams/sittings/[sittingId]',
        'page',
      )
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
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
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
    it('surfaces "Cannot void a finished attempt" when voiding after submission', async () => {
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

    it('surfaces "Code not found" when the code does not exist', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'code_not_found' } })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Code not found')
    })

    it('does not map a longer message that merely contains code_not_found', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'xx code_not_found' } })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).not.toBe('Code not found')
    })

    it('surfaces an admin-permission error when the RPC rejects the caller', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'not_admin' } })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Admin permission required')
    })

    it('surfaces an admin-permission error when the admin account is no longer active', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'admin_not_found' } })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Admin permission required')
    })

    it('surfaces a blank-reason error when the reason is whitespace-only', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'invalid_reason' } })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Reason cannot be blank or whitespace-only')
    })

    it('surfaces a refresh-and-retry error when the session changed concurrently', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'session_state_changed' } })
      const result = await voidInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(
          'This session was modified by another action — please refresh and retry',
        )
      }
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
