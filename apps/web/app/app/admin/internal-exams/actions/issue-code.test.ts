import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@/lib/supabase-rpc', () => ({ rpc: mockRpc }))

// ---- Subject under test ---------------------------------------------------

import { issueInternalExamCode } from './issue-code'

// ---- Helpers ---------------------------------------------------------------

const STUDENT_ID = '00000000-0000-4000-a000-000000000001'
const SUBJECT_ID = '00000000-0000-4000-a000-000000000002'
const CODE_ID = '00000000-0000-4000-a000-000000000099'
const SUPABASE = { __marker: 'supabase' }

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: SUPABASE,
    organizationId: 'org-001',
    userId: 'admin-001',
  })
}

const VALID_INPUT = { studentId: STUDENT_ID, subjectId: SUBJECT_ID }
const RPC_OK_ROW = {
  code_id: CODE_ID,
  code: 'ABCD2345',
  expires_at: '2026-04-29T00:00:00.000Z',
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('issueInternalExamCode', () => {
  describe('input validation', () => {
    it('rejects missing fields', async () => {
      const result = await issueInternalExamCode({})
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Invalid input')
    })

    it('rejects non-uuid studentId', async () => {
      const result = await issueInternalExamCode({ studentId: 'not-a-uuid', subjectId: SUBJECT_ID })
      expect(result.success).toBe(false)
    })

    it('rejects non-uuid subjectId', async () => {
      const result = await issueInternalExamCode({ studentId: STUDENT_ID, subjectId: 'bad' })
      expect(result.success).toBe(false)
    })
  })

  describe('RPC call', () => {
    it('calls issue_internal_exam_code with correct parameters', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: [RPC_OK_ROW], error: null })

      await issueInternalExamCode(VALID_INPUT)

      expect(mockRpc).toHaveBeenCalledWith(SUPABASE, 'issue_internal_exam_code', {
        p_subject_id: SUBJECT_ID,
        p_student_id: STUDENT_ID,
      })
    })

    it('returns code data on success and revalidates path', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: [RPC_OK_ROW], error: null })

      const result = await issueInternalExamCode(VALID_INPUT)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.codeId).toBe(CODE_ID)
        expect(result.code).toBe('ABCD2345')
        expect(result.expiresAt).toBe('2026-04-29T00:00:00.000Z')
      }
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    })

    it('handles RPC returning a single object (not an array)', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: RPC_OK_ROW, error: null })

      const result = await issueInternalExamCode(VALID_INPUT)

      expect(result.success).toBe(true)
    })

    it('returns "Failed to issue internal exam code" when RPC returns null data', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: null })

      const result = await issueInternalExamCode(VALID_INPUT)

      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Failed to issue internal exam code')
    })

    it('returns "Failed to issue internal exam code" when RPC returns malformed shape', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: [{ wrong: 'shape' }], error: null })

      const result = await issueInternalExamCode(VALID_INPUT)

      expect(result.success).toBe(false)
    })
  })

  describe('error code mapping', () => {
    it('maps not_authenticated', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'P0001: not_authenticated' },
      })
      const result = await issueInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Not authenticated')
    })

    it('maps not_admin', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'not_admin' } })
      const result = await issueInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Admin permission required')
    })

    it('maps student_not_found', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'student_not_found' } })
      const result = await issueInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Student not found in your organization')
    })

    it('maps subject_not_found', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'subject_not_found' } })
      const result = await issueInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Subject not found')
    })

    it('maps exam_config_required', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'exam_config_required' } })
      const result = await issueInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Configure exam for this subject first')
    })

    it('maps code_generation_failed', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'code_generation_failed' } })
      const result = await issueInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Failed to generate code, please try again')
    })

    it('returns generic message for unrecognized RPC error', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
      const result = await issueInternalExamCode(VALID_INPUT)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Failed to issue internal exam code')
    })

    it('does not revalidate on RPC error', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'student_not_found' } })
      await issueInternalExamCode(VALID_INPUT)
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates auth errors from requireAdmin', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Not admin'))

      await expect(issueInternalExamCode(VALID_INPUT)).rejects.toThrow('Not admin')
    })
  })
})
