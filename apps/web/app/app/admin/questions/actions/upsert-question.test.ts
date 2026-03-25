import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { upsertQuestion } from './upsert-question'

// ---- Helpers ---------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'
const ORG_UUID = '00000000-0000-4000-a000-000000000002'
const BANK_UUID = '00000000-0000-4000-a000-000000000003'

const VALID_OPTIONS = [
  { id: 'a' as const, text: 'Option A', correct: true },
  { id: 'b' as const, text: 'Option B', correct: false },
  { id: 'c' as const, text: 'Option C', correct: false },
  { id: 'd' as const, text: 'Option D', correct: false },
]

const VALID_INPUT = {
  subject_id: VALID_UUID,
  topic_id: VALID_UUID,
  subtopic_id: null,
  question_text: 'What is the minimum safe altitude?',
  options: VALID_OPTIONS,
  explanation_text: 'The minimum safe altitude is 500 ft.',
  difficulty: 'medium' as const,
  status: 'active' as const,
}

// Builds a chain for the insert path:
// users.select().eq().single() → { data: { organization_id }, error }
// question_banks.select().eq().limit().single() → { data: { id }, error }
// questions.insert() → { error }
function buildInsertChain({
  profileError = null,
  bankError = null,
  insertError = null,
}: {
  profileError?: { message: string; code?: string } | null
  bankError?: { message: string; code?: string } | null
  insertError?: { message: string; code?: string } | null
} = {}) {
  const questionsBankChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: bankError ? null : { id: BANK_UUID },
            error: bankError,
          }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
  }

  const usersChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: profileError ? null : { organization_id: ORG_UUID },
          error: profileError,
        }),
      }),
    }),
  }

  mockFrom.mockImplementation((table: string) => {
    if (table === 'users') return usersChain
    if (table === 'question_banks') return questionsBankChain
    if (table === 'questions') return questionsBankChain
    return questionsBankChain
  })
}

// Builds a chain for the update path:
// questions.select('version').eq().single() → { data: { version }, error: fetchError }
// questions.update().eq() → { error: updateError }
function buildUpdateChain({
  fetchError = null,
  updateError = null,
  currentVersion = 3,
  updatedRows = [{ id: 'q1' }],
}: {
  fetchError?: { message: string; code?: string } | null
  updateError?: { message: string; code?: string } | null
  currentVersion?: number
  updatedRows?: { id: string }[]
} = {}) {
  const updateChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: fetchError ? null : { version: currentVersion },
          error: fetchError,
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: updateError ? null : updatedRows,
            error: updateError,
          }),
        }),
      }),
    }),
  }

  mockFrom.mockReturnValue(updateChain)
  return updateChain
}

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: { from: mockFrom },
    userId: 'admin-user-1',
  })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('upsertQuestion', () => {
  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await upsertQuestion({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when options array has fewer than 4 items', async () => {
      const result = await upsertQuestion({
        ...VALID_INPUT,
        options: VALID_OPTIONS.slice(0, 3),
      })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when no option is marked correct', async () => {
      const result = await upsertQuestion({
        ...VALID_INPUT,
        options: VALID_OPTIONS.map((o) => ({ ...o, correct: false })),
      })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when more than one option is marked correct', async () => {
      const result = await upsertQuestion({
        ...VALID_INPUT,
        options: VALID_OPTIONS.map((o) => ({ ...o, correct: true })),
      })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when difficulty is not a valid enum value', async () => {
      const result = await upsertQuestion({ ...VALID_INPUT, difficulty: 'extreme' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when id is present but not a valid UUID', async () => {
      const result = await upsertQuestion({ ...VALID_INPUT, id: 'not-a-uuid' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('insert path (no id)', () => {
    it('inserts a new question and revalidates on success', async () => {
      mockAdmin()
      buildInsertChain()

      const result = await upsertQuestion(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockFrom).toHaveBeenCalledWith('users')
      expect(mockFrom).toHaveBeenCalledWith('question_banks')
      expect(mockFrom).toHaveBeenCalledWith('questions')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/questions')
    })

    it('returns failure when user profile lookup fails', async () => {
      mockAdmin()
      buildInsertChain({ profileError: { message: 'profile not found' } })

      const result = await upsertQuestion(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Could not resolve organization')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure when no question bank exists for the organization', async () => {
      mockAdmin()
      buildInsertChain({ bankError: { message: 'no rows' } })

      const result = await upsertQuestion(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('No question bank found for organization')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns a duplicate-number message when insert violates unique constraint', async () => {
      mockAdmin()
      buildInsertChain({ insertError: { message: 'duplicate key', code: '23505' } })

      const result = await upsertQuestion(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('A question with this number already exists')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns the DB error message when insert fails with a generic error', async () => {
      mockAdmin()
      buildInsertChain({ insertError: { message: 'connection timeout' } })

      const result = await upsertQuestion(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to save question')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('update path (with id)', () => {
    it('updates an existing question and revalidates on success', async () => {
      mockAdmin()
      const chain = buildUpdateChain()

      const result = await upsertQuestion({ ...VALID_INPUT, id: VALID_UUID })

      expect(result.success).toBe(true)
      expect(chain.update).toHaveBeenCalled()
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/questions')
    })

    it('returns failure when the question to update is not found', async () => {
      mockAdmin()
      buildUpdateChain({ fetchError: { message: 'no rows returned', code: 'PGRST116' } })

      const result = await upsertQuestion({ ...VALID_INPUT, id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Question not found')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns a duplicate-number message when update violates unique constraint', async () => {
      mockAdmin()
      buildUpdateChain({ updateError: { message: 'duplicate key', code: '23505' } })

      const result = await upsertQuestion({ ...VALID_INPUT, id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('A question with this number already exists')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns the DB error message when update fails with a generic error', async () => {
      mockAdmin()
      buildUpdateChain({ updateError: { message: 'deadlock detected' } })

      const result = await upsertQuestion({ ...VALID_INPUT, id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('deadlock detected')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('increments the version by 1 when updating', async () => {
      mockAdmin()
      const chain = buildUpdateChain({ currentVersion: 5 })

      await upsertQuestion({ ...VALID_INPUT, id: VALID_UUID })

      const updateCall = chain.update.mock.calls[0]?.[0] as { version: number }
      expect(updateCall?.version).toBe(6)
    })

    it('returns conflict error when version has changed (zero rows updated)', async () => {
      mockAdmin()
      buildUpdateChain({ updatedRows: [] })

      const result = await upsertQuestion({ ...VALID_INPUT, id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Question was modified by another user, please refresh')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns generic error when fetch fails with non-404 error', async () => {
      mockAdmin()
      buildUpdateChain({ fetchError: { message: 'connection reset', code: 'PGRST500' } })

      const result = await upsertQuestion({ ...VALID_INPUT, id: VALID_UUID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to load question')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(upsertQuestion(VALID_INPUT)).rejects.toThrow('Forbidden: admin role required')
    })
  })
})
