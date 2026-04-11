import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@/lib/supabase-rpc', () => ({ rpc: mockRpc }))

// ---- Subject under test ---------------------------------------------------

import { upsertExamConfig } from './upsert-exam-config'

// ---- Helpers ---------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const CONFIG_ID = '00000000-0000-4000-a000-000000000099'
const SUPABASE = { __marker: 'supabase' }

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: SUPABASE,
    organizationId: 'org-001',
  })
}

const VALID_INPUT = {
  subjectId: SUBJECT_ID,
  enabled: true,
  totalQuestions: 10,
  timeLimitSeconds: 3600,
  passMark: 75,
  distributions: [
    { topicId: '00000000-0000-4000-a000-000000000002', subtopicId: null, questionCount: 10 },
  ],
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('upsertExamConfig', () => {
  describe('input validation', () => {
    it('rejects missing fields', async () => {
      const result = await upsertExamConfig({})
      expect(result.success).toBe(false)
    })

    it('rejects when distribution sum does not match totalQuestions', async () => {
      const result = await upsertExamConfig({
        ...VALID_INPUT,
        totalQuestions: 20,
      })
      expect(result.success).toBe(false)
    })

    it('rejects totalQuestions exceeding max (200)', async () => {
      const result = await upsertExamConfig({
        ...VALID_INPUT,
        totalQuestions: 201,
        distributions: [{ topicId: SUBJECT_ID, subtopicId: null, questionCount: 201 }],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('RPC call', () => {
    it('calls upsert_exam_config RPC with correct parameters', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: CONFIG_ID, error: null })

      await upsertExamConfig(VALID_INPUT)

      expect(mockRpc).toHaveBeenCalledWith(SUPABASE, 'upsert_exam_config', {
        p_subject_id: SUBJECT_ID,
        p_enabled: true,
        p_total_questions: 10,
        p_time_limit_seconds: 3600,
        p_pass_mark: 75,
        p_distributions: [
          { topicId: '00000000-0000-4000-a000-000000000002', subtopicId: null, questionCount: 10 },
        ],
      })
    })

    it('returns success and revalidates path on RPC success', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: CONFIG_ID, error: null })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/exam-config')
    })

    it('returns failure when RPC returns an error', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'admin access required' } })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Failed to save exam configuration')
      }
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure when RPC returns null data', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: null, error: null })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Failed to save exam configuration')
      }
    })

    it('coerces undefined subtopicId to null in distributions', async () => {
      mockAdmin()
      mockRpc.mockResolvedValue({ data: CONFIG_ID, error: null })

      await upsertExamConfig({
        ...VALID_INPUT,
        distributions: [{ topicId: '00000000-0000-4000-a000-000000000002', questionCount: 10 }],
      })

      const callArgs = mockRpc.mock.calls[0]?.[2] as Record<string, unknown>
      const dists = callArgs.p_distributions as Array<Record<string, unknown>>
      expect(dists[0]?.subtopicId).toBeNull()
    })
  })

  describe('auth guard', () => {
    it('propagates auth errors from requireAdmin', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Not admin'))

      await expect(upsertExamConfig(VALID_INPUT)).rejects.toThrow('Not admin')
    })
  })
})
