import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { toggleExamConfig } from './toggle-exam-config'

// ---- Helpers ---------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const CONFIG_ID = '00000000-0000-4000-a000-000000000002'
const ORG_ID = 'org-00000001'

const VALID_ENABLE = { subjectId: SUBJECT_ID, enabled: true }
const VALID_DISABLE = { subjectId: SUBJECT_ID, enabled: false }

type FakeError = { message: string } | null

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: mockFrom },
    organizationId: ORG_ID,
  })
}

// Builds the multi-table call chain used when enabling:
//   exam_configs.select().eq().eq().is().maybeSingle()  → config lookup
//   exam_config_distributions.select().eq()              → distributions lookup
//   exam_configs.update().eq().eq().is().select()        → update
function buildEnableChain({
  configError = null,
  configData = { id: CONFIG_ID, total_questions: 10 } as {
    id: string
    total_questions: number
  } | null,
  distError = null,
  distData = [{ question_count: 10 }] as { question_count: number }[] | null,
  updateError = null,
  updateData = [{ id: CONFIG_ID }] as { id: string }[] | null,
}: {
  configError?: FakeError
  configData?: { id: string; total_questions: number } | null
  distError?: FakeError
  distData?: { question_count: number }[] | null
  updateError?: FakeError
  updateData?: { id: string }[] | null
} = {}) {
  const configLookupChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: configData, error: configError }),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: updateData, error: updateError }),
          }),
        }),
      }),
    }),
  }

  const distLookupChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: distData, error: distError }),
    }),
  }

  mockFrom.mockImplementation((table: string) => {
    if (table === 'exam_config_distributions') return distLookupChain
    return configLookupChain
  })
}

// Builds the chain for the disable path (no pre-flight reads):
//   exam_configs.update().eq().eq().is().select()
function buildDisableChain({
  updateError = null,
  updateData = [{ id: CONFIG_ID }] as { id: string }[] | null,
}: {
  updateError?: FakeError
  updateData?: { id: string }[] | null
} = {}) {
  mockFrom.mockReturnValue({
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: updateData, error: updateError }),
          }),
        }),
      }),
    }),
  })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('toggleExamConfig', () => {
  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await toggleExamConfig({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when subjectId is not a valid UUID', async () => {
      const result = await toggleExamConfig({ subjectId: 'not-a-uuid', enabled: true })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when enabled is not a boolean', async () => {
      const result = await toggleExamConfig({ subjectId: SUBJECT_ID, enabled: 'yes' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('disable path (enabled: false)', () => {
    it('updates the config and revalidates when disabling succeeds', async () => {
      mockAdmin()
      buildDisableChain()

      const result = await toggleExamConfig(VALID_DISABLE)

      expect(result.success).toBe(true)
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/exam-config')
    })

    it('returns failure when the update query fails', async () => {
      mockAdmin()
      buildDisableChain({ updateError: { message: 'db error' } })

      const result = await toggleExamConfig(VALID_DISABLE)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to update exam status')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure when no rows were updated (config not found)', async () => {
      mockAdmin()
      buildDisableChain({ updateData: [] })

      const result = await toggleExamConfig(VALID_DISABLE)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Config not found')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('enable path (enabled: true) — config pre-flight', () => {
    it('returns failure when the config lookup query fails', async () => {
      mockAdmin()
      buildEnableChain({ configError: { message: 'read error' } })

      const result = await toggleExamConfig(VALID_ENABLE)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to check exam configuration')
    })

    it('returns failure when no config exists for the subject', async () => {
      mockAdmin()
      buildEnableChain({ configData: null })

      const result = await toggleExamConfig(VALID_ENABLE)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Configure exam parameters before enabling')
    })
  })

  describe('enable path (enabled: true) — distribution pre-flight', () => {
    it('returns failure when the distribution lookup query fails', async () => {
      mockAdmin()
      buildEnableChain({ distError: { message: 'dist read error' } })

      const result = await toggleExamConfig(VALID_ENABLE)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to check question distribution')
    })

    it('returns failure when distributed total does not match total_questions', async () => {
      mockAdmin()
      buildEnableChain({
        configData: { id: CONFIG_ID, total_questions: 10 },
        distData: [{ question_count: 7 }],
      })

      const result = await toggleExamConfig(VALID_ENABLE)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Distribution total (7) does not match total questions (10)')
    })

    it('treats null distributions response as zero total (mismatch)', async () => {
      mockAdmin()
      buildEnableChain({
        configData: { id: CONFIG_ID, total_questions: 10 },
        distData: null,
      })

      const result = await toggleExamConfig(VALID_ENABLE)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Distribution total (0) does not match total questions (10)')
    })
  })

  describe('enable path (enabled: true) — happy path', () => {
    it('enables the config and revalidates when all checks pass', async () => {
      mockAdmin()
      buildEnableChain()

      const result = await toggleExamConfig(VALID_ENABLE)

      expect(result.success).toBe(true)
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/exam-config')
    })

    it('returns failure when the update step fails after passing pre-flight checks', async () => {
      mockAdmin()
      buildEnableChain({ updateError: { message: 'update failed' } })

      const result = await toggleExamConfig(VALID_ENABLE)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to update exam status')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure when no rows updated after passing pre-flight checks', async () => {
      mockAdmin()
      buildEnableChain({ updateData: [] })

      const result = await toggleExamConfig(VALID_ENABLE)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Config not found')
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(toggleExamConfig(VALID_ENABLE)).rejects.toThrow('Forbidden: admin role required')
    })
  })
})
