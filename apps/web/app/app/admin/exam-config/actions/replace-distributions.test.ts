import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn())

// replaceDistributions receives the supabase client as a parameter — we build
// a fake client inline per test rather than mocking @repo/db/server.

// ---- Subject under test ---------------------------------------------------

import { replaceDistributions } from './replace-distributions'

// ---- Helpers ---------------------------------------------------------------

const CONFIG_ID = '00000000-0000-4000-a000-000000000001'
const TOPIC_ID = '00000000-0000-4000-a000-000000000002'
const SUBTOPIC_ID = '00000000-0000-4000-a000-000000000003'

const VALID_DISTRIBUTIONS = [
  { topicId: TOPIC_ID, subtopicId: null, questionCount: 5 },
  { topicId: TOPIC_ID, subtopicId: SUBTOPIC_ID, questionCount: 3 },
]

type FakeError = { message: string } | null

function buildSupabaseClient({
  deleteError = null,
  insertError = null,
}: {
  deleteError?: FakeError
  insertError?: FakeError
} = {}) {
  const insertChain = {
    insert: vi.fn().mockResolvedValue({ error: insertError }),
  }

  const deleteChain = {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: deleteError }),
    }),
    ...insertChain,
  }

  mockFrom.mockReturnValue(deleteChain)

  return { from: mockFrom }
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('replaceDistributions', () => {
  describe('delete step', () => {
    it('returns failure when deleting existing distributions fails', async () => {
      const supabase = buildSupabaseClient({ deleteError: { message: 'delete failed' } })

      const result = await replaceDistributions(
        supabase as unknown as Parameters<typeof replaceDistributions>[0],
        CONFIG_ID,
        VALID_DISTRIBUTIONS,
      )

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to update question distribution')
    })

    it('scopes the delete to the given config id', async () => {
      const supabase = buildSupabaseClient()

      await replaceDistributions(
        supabase as unknown as Parameters<typeof replaceDistributions>[0],
        CONFIG_ID,
        [],
      )

      expect(mockFrom).toHaveBeenCalledWith('exam_config_distributions')
      const deleteChain = mockFrom.mock.results[0]?.value as {
        delete: ReturnType<typeof vi.fn>
      }
      const eqFn = deleteChain.delete.mock.results[0]?.value as {
        eq: ReturnType<typeof vi.fn>
      }
      expect(eqFn.eq).toHaveBeenCalledWith('exam_config_id', CONFIG_ID)
    })
  })

  describe('insert step — empty distributions', () => {
    it('skips the insert call and returns success when distributions array is empty', async () => {
      const supabase = buildSupabaseClient()

      const result = await replaceDistributions(
        supabase as unknown as Parameters<typeof replaceDistributions>[0],
        CONFIG_ID,
        [],
      )

      expect(result.success).toBe(true)
      // from() called once for delete, not for insert
      expect(mockFrom).toHaveBeenCalledTimes(1)
    })
  })

  describe('insert step — non-empty distributions', () => {
    it('returns success after deleting and inserting distributions', async () => {
      const supabase = buildSupabaseClient()

      const result = await replaceDistributions(
        supabase as unknown as Parameters<typeof replaceDistributions>[0],
        CONFIG_ID,
        VALID_DISTRIBUTIONS,
      )

      expect(result.success).toBe(true)
    })

    it('maps distributions to snake_case rows with the config id stamped in', async () => {
      const supabase = buildSupabaseClient()
      const insertFn =
        (mockFrom.mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }),
        mockFrom)

      await replaceDistributions(
        supabase as unknown as Parameters<typeof replaceDistributions>[0],
        CONFIG_ID,
        [{ topicId: TOPIC_ID, subtopicId: SUBTOPIC_ID, questionCount: 7 }],
      )

      // The second from() call (insert) receives the mapped rows
      const insertFromResult = insertFn.mock.results[1]?.value as {
        insert: ReturnType<typeof vi.fn>
      }
      expect(insertFromResult.insert).toHaveBeenCalledWith([
        {
          exam_config_id: CONFIG_ID,
          topic_id: TOPIC_ID,
          subtopic_id: SUBTOPIC_ID,
          question_count: 7,
        },
      ])
    })

    it('coerces undefined subtopicId to null in the inserted row', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null })
      mockFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        insert: insertMock,
      })

      const supabase = { from: mockFrom }

      await replaceDistributions(
        supabase as unknown as Parameters<typeof replaceDistributions>[0],
        CONFIG_ID,
        [{ topicId: TOPIC_ID, subtopicId: undefined, questionCount: 4 }],
      )

      expect(insertMock).toHaveBeenCalledWith([expect.objectContaining({ subtopic_id: null })])
    })

    it('returns failure when the insert call fails', async () => {
      const supabase = buildSupabaseClient({ insertError: { message: 'insert failed' } })

      const result = await replaceDistributions(
        supabase as unknown as Parameters<typeof replaceDistributions>[0],
        CONFIG_ID,
        VALID_DISTRIBUTIONS,
      )

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to save question distribution')
    })
  })
})
