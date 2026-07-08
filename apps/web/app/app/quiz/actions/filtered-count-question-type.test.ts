import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------
// Split from filtered-count.test.ts (code-style.md §7 test-file cap — that file
// grew past 500 lines) — the questionType (#1008 / Slice 3 RT type filter) and
// per-filter-variant (unseen/incorrect/flagged) coverage. Shared mock setup is
// duplicated from the sibling file rather than extracted, since it's a handful
// of hoisted vi.fn()s, not a reusable buildChain helper.

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { getFilteredCount } from './filtered-count'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const TOPIC_ID = '00000000-0000-4000-a000-000000000020'
const SUBTOPIC_ID = '00000000-0000-4000-a000-000000000030'

// ---- Helpers --------------------------------------------------------------

function setupAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
}

beforeEach(() => {
  vi.resetAllMocks()
  // Default to empty count rows so tests that don't override don't crash on undefined.
  mockRpc.mockResolvedValue({ data: [], error: null })
})

// ---- getFilteredCount — questionType (#1008 / Slice 3 RT type filter) -----

describe('getFilteredCount — questionType', () => {
  it("passes p_question_type 'multiple_choice' when questionType is 'multiple_choice'", async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getFilteredCount({
      subjectId: SUBJECT_ID,
      filters: ['all'],
      questionType: 'multiple_choice',
    })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_question_type: 'multiple_choice' }),
    )
  })

  it("passes p_question_type 'ordering' when the RT type filter selects Ordering", async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getFilteredCount({
      subjectId: SUBJECT_ID,
      filters: ['all'],
      questionType: 'ordering',
    })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_question_type: 'ordering' }),
    )
  })

  it('passes p_question_type null when questionType is omitted (type-agnostic quiz/exam count)', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_question_type: null }),
    )
  })

  it('returns empty count and logs when questionType is an unsupported value', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      filters: ['all'],
      questionType: 'true_false',
    })
    expect(result).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
    expect(consoleSpy).toHaveBeenCalledWith('[getFilteredCount] Invalid input')
    // Invalid client input must be rejected at the Zod boundary before any RPC call.
    expect(mockRpc).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

// ---- getFilteredCount — filters: ['unseen'] ------------------------------

describe("getFilteredCount — filters: ['unseen']", () => {
  it('returns the rpc-aggregated count for unseen questions', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({
      data: [{ topic_id: TOPIC_ID, subtopic_id: null, n: 2 }],
      error: null,
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['unseen'] })

    expect(result).toMatchObject({ count: 2 })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_filters: ['unseen'] }),
    )
  })

  it('returns count 0 when the rpc yields no rows', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['unseen'] })

    expect(result).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
  })
})

// ---- getFilteredCount — filters: ['incorrect'] ---------------------------

describe("getFilteredCount — filters: ['incorrect']", () => {
  it('returns the rpc-aggregated count for incorrectly-answered questions', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({
      data: [
        { topic_id: TOPIC_ID, subtopic_id: SUBTOPIC_ID, n: 1 },
        { topic_id: TOPIC_ID, subtopic_id: null, n: 1 },
      ],
      error: null,
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['incorrect'] })

    expect(result).toMatchObject({ count: 2, byTopic: { [TOPIC_ID]: 2 } })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_filters: ['incorrect'] }),
    )
  })

  it('returns count 0 when no incorrectly-answered questions exist', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['incorrect'] })

    expect(result).toMatchObject({ count: 0 })
  })
})

// ---- getFilteredCount — filters: ['flagged'] -----------------------------

describe("getFilteredCount — filters: ['flagged']", () => {
  it('returns the rpc-aggregated count for flagged questions', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({
      data: [{ topic_id: TOPIC_ID, subtopic_id: SUBTOPIC_ID, n: 1 }],
      error: null,
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['flagged'] })

    expect(result).toMatchObject({ count: 1, bySubtopic: { [SUBTOPIC_ID]: 1 } })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_filters: ['flagged'] }),
    )
  })

  it('returns count 0 when student has no flagged questions', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['flagged'] })

    expect(result).toMatchObject({ count: 0 })
  })
})
