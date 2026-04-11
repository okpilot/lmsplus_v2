import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockReplaceDistributions = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('./replace-distributions', () => ({
  replaceDistributions: (...args: unknown[]) => mockReplaceDistributions(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { upsertExamConfig } from './upsert-exam-config'

// ---- Helpers ---------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const CONFIG_ID = '00000000-0000-4000-a000-000000000002'
const TOPIC_ID = '00000000-0000-4000-a000-000000000003'
const ORG_ID = 'org-00000001'

const VALID_DISTRIBUTIONS = [{ topicId: TOPIC_ID, subtopicId: null, questionCount: 10 }]

const VALID_INPUT = {
  subjectId: SUBJECT_ID,
  enabled: false,
  totalQuestions: 10,
  timeLimitSeconds: 3600,
  passMark: 75,
  distributions: VALID_DISTRIBUTIONS,
}

type FakeError = { message: string; code?: string } | null

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: mockFrom },
    organizationId: ORG_ID,
  })
}

// Builds the lookup → (update | insert) chain.
// When existingId is set, the lookup returns that record and the update chain is used.
// When existingId is null, the lookup returns null and the insert chain is used.
function buildChain({
  lookupError = null,
  existingId = null as string | null,
  updateError = null,
  updateData = [{ id: CONFIG_ID }] as { id: string }[] | null,
  insertError = null,
  insertData = { id: CONFIG_ID } as { id: string } | null,
}: {
  lookupError?: FakeError
  existingId?: string | null
  updateError?: FakeError
  updateData?: { id: string }[] | null
  insertError?: FakeError
  insertData?: { id: string } | null
} = {}) {
  const lookupChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: existingId ? { id: existingId } : null,
              error: lookupError,
            }),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: updateData, error: updateError }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: insertData, error: insertError }),
      }),
    }),
  }

  mockFrom.mockReturnValue(lookupChain)
  return lookupChain
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockReplaceDistributions.mockResolvedValue({ success: true })
})

describe('upsertExamConfig', () => {
  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await upsertExamConfig({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when subjectId is not a valid UUID', async () => {
      const result = await upsertExamConfig({ ...VALID_INPUT, subjectId: 'bad-id' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when totalQuestions exceeds max (200)', async () => {
      const result = await upsertExamConfig({ ...VALID_INPUT, totalQuestions: 201 })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when distributions array is empty', async () => {
      const result = await upsertExamConfig({ ...VALID_INPUT, distributions: [] })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when distribution totals do not match totalQuestions', async () => {
      const result = await upsertExamConfig({
        ...VALID_INPUT,
        totalQuestions: 10,
        distributions: [{ topicId: TOPIC_ID, subtopicId: null, questionCount: 7 }],
      })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('lookup step', () => {
    it('returns failure when the config lookup query fails', async () => {
      mockAdmin()
      buildChain({ lookupError: { message: 'lookup failed' } })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to check existing configuration')
      expect(mockReplaceDistributions).not.toHaveBeenCalled()
    })
  })

  describe('update path (config already exists)', () => {
    it('updates the config and replaces distributions, then revalidates', async () => {
      mockAdmin()
      buildChain({ existingId: CONFIG_ID })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockReplaceDistributions).toHaveBeenCalledWith(
        expect.anything(),
        CONFIG_ID,
        VALID_DISTRIBUTIONS,
      )
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/exam-config')
    })

    it('returns failure when the update query fails', async () => {
      mockAdmin()
      buildChain({ existingId: CONFIG_ID, updateError: { message: 'update failed' } })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to update exam configuration')
      expect(mockReplaceDistributions).not.toHaveBeenCalled()
    })

    it('returns failure when update affects zero rows (concurrent modification)', async () => {
      mockAdmin()
      buildChain({ existingId: CONFIG_ID, updateData: [] })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Config was modified concurrently — please refresh')
    })
  })

  describe('insert path (no existing config)', () => {
    it('inserts a new config and replaces distributions, then revalidates', async () => {
      mockAdmin()
      buildChain({ existingId: null, insertData: { id: CONFIG_ID } })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockReplaceDistributions).toHaveBeenCalledWith(
        expect.anything(),
        CONFIG_ID,
        VALID_DISTRIBUTIONS,
      )
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/exam-config')
    })

    it('returns failure when the insert query fails', async () => {
      mockAdmin()
      buildChain({ existingId: null, insertError: { message: 'insert failed' } })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to create exam configuration')
      expect(mockReplaceDistributions).not.toHaveBeenCalled()
    })

    it('returns failure when insert returns no data', async () => {
      mockAdmin()
      buildChain({ existingId: null, insertData: null })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to create exam configuration')
    })
  })

  describe('replaceDistributions delegation', () => {
    it('returns the replaceDistributions failure directly when distributions fail', async () => {
      mockAdmin()
      buildChain({ existingId: CONFIG_ID })
      mockReplaceDistributions.mockResolvedValue({
        success: false,
        error: 'Failed to save question distribution',
      })

      const result = await upsertExamConfig(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to save question distribution')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(upsertExamConfig(VALID_INPUT)).rejects.toThrow('Forbidden: admin role required')
    })
  })
})
