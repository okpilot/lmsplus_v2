import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

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
const TOPIC_ID_2 = '00000000-0000-4000-a000-000000000021'
const SUBTOPIC_ID = '00000000-0000-4000-a000-000000000030'
const SUBTOPIC_ID_2 = '00000000-0000-4000-a000-000000000031'

// ---- Helpers --------------------------------------------------------------

function setupAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
}

function setupUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

beforeEach(() => {
  vi.resetAllMocks()
  // Default to empty count rows so tests that don't override don't crash on undefined.
  mockRpc.mockResolvedValue({ data: [], error: null })
})

// ---- getFilteredCount — auth & validation ---------------------------------

describe('getFilteredCount — auth and validation', () => {
  it('returns auth error when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })
    expect(result).toMatchObject({ count: 0, error: 'auth' })
    // RPC must not be called when auth gate fails.
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns auth error when authentication fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })
    expect(result).toMatchObject({ count: 0, error: 'auth' })
  })

  it('returns empty count and logs when subjectId is not a valid UUID', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getFilteredCount({ subjectId: 'not-a-uuid', filters: ['all'] })
    expect(result).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
    expect(consoleSpy).toHaveBeenCalledWith('[getFilteredCount] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty count and logs when filters contains an unknown value', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['random'] })
    expect(result).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
    expect(consoleSpy).toHaveBeenCalledWith('[getFilteredCount] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty count and logs when topicIds contains a non-UUID', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: ['bad-id'],
      filters: ['all'],
    })
    expect(result).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
    expect(consoleSpy).toHaveBeenCalledWith('[getFilteredCount] Invalid input')
    consoleSpy.mockRestore()
  })
})

// ---- getFilteredCount — aggregation contract -----------------------------

describe('getFilteredCount — aggregation from grouped rpc rows', () => {
  it('sums total count and groups counts by topic and subtopic', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({
      data: [
        { topic_id: TOPIC_ID, subtopic_id: SUBTOPIC_ID, n: 2 },
        { topic_id: TOPIC_ID, subtopic_id: SUBTOPIC_ID_2, n: 3 },
        { topic_id: TOPIC_ID_2, subtopic_id: null, n: 1 },
      ],
      error: null,
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(result).toEqual({
      count: 6,
      byTopic: { [TOPIC_ID]: 5, [TOPIC_ID_2]: 1 },
      bySubtopic: { [SUBTOPIC_ID]: 2, [SUBTOPIC_ID_2]: 3 },
    })
  })

  it('coerces string-encoded bigint n to a number when summing', async () => {
    // PostgREST serializes COUNT(*)::bigint as a JSON string; Number(r.n) ensures '1' + '2' = 3, not '12'.
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({
      data: [
        { topic_id: TOPIC_ID, subtopic_id: SUBTOPIC_ID, n: '1' },
        { topic_id: TOPIC_ID, subtopic_id: SUBTOPIC_ID, n: '2' },
      ],
      error: null,
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(result.count).toBe(3)
    expect(result.byTopic[TOPIC_ID]).toBe(3)
    expect(result.bySubtopic[SUBTOPIC_ID]).toBe(3)
  })

  it("strips 'all' from p_filters and passes the remaining filters through", async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getFilteredCount({
      subjectId: SUBJECT_ID,
      filters: ['all', 'unseen'],
    })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({
        p_subject_id: SUBJECT_ID,
        p_filters: ['unseen'],
      }),
    )
  })

  it("defaults p_calc_mode to 'all' when calcMode is omitted", async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_calc_mode: 'all' }),
    )
  })

  it("passes p_calc_mode through literally (does NOT strip 'all')", async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'], calcMode: 'exclude' })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_calc_mode: 'exclude' }),
    )
  })

  it('returns empty count and logs when calcMode is an unknown value', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      filters: ['all'],
      calcMode: 'sometimes',
    })
    expect(result).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
    expect(consoleSpy).toHaveBeenCalledWith('[getFilteredCount] Invalid input')
    consoleSpy.mockRestore()
  })

  it("defaults p_has_image to 'all' when imageMode is omitted", async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_has_image: 'all' }),
    )
  })

  it("passes p_has_image through literally (does NOT strip 'all')", async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'], imageMode: 'exclude' })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_has_image: 'exclude' }),
    )
  })

  it('returns empty count and logs when imageMode is an unknown value', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      filters: ['all'],
      imageMode: 'sometimes',
    })
    expect(result).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
    expect(consoleSpy).toHaveBeenCalledWith('[getFilteredCount] Invalid input')
    consoleSpy.mockRestore()
  })

  it('sends p_topic_ids and p_subtopic_ids as null when callers omit them', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_topic_ids: null, p_subtopic_ids: null }),
    )
  })

  it('returns empty result and logs when the rpc returns an error', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc boom' } })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(result).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[getFilteredCount]'),
      'rpc boom',
    )
    consoleSpy.mockRestore()
  })

  it('returns empty result when the rpc data is not an array', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(result).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
  })

  it('excludes malformed rows from aggregation totals', async () => {
    // Defensive per-row filter — if the RPC ever returns malformed rows, NaN
    // must not poison count/byTopic and non-string topic_id keys must not
    // index into the record under a coerced key like "undefined".
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({
      data: [
        { topic_id: TOPIC_ID, subtopic_id: SUBTOPIC_ID, n: 2 },
        null,
        { topic_id: TOPIC_ID, subtopic_id: SUBTOPIC_ID, n: 'not-a-number' },
        { topic_id: 42, subtopic_id: SUBTOPIC_ID, n: 5 },
        { topic_id: TOPIC_ID_2, subtopic_id: 99, n: 3 },
      ],
      error: null,
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    // Only the first and fifth rows are well-formed (the fifth's numeric
    // subtopic_id is dropped from bySubtopic by the typeof string guard).
    expect(result).toEqual({
      count: 5,
      byTopic: { [TOPIC_ID]: 2, [TOPIC_ID_2]: 3 },
      bySubtopic: { [SUBTOPIC_ID]: 2 },
    })
  })
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

// ---- getFilteredCount — empty-array semantics ----------------------------

describe('getFilteredCount — empty-array semantics (empty array = match nothing, aligned to quiz selection)', () => {
  // #668/#678/#679: the count RPC and the random-id RPC share `_filtered_question_pool`,
  // so an empty `p_topic_ids` (or `p_subtopic_ids`) matches nothing in BOTH paths.
  // This restores count == quiz consistency: the count badge can no longer claim
  // there are questions to start, when the same selection would actually start zero.

  it('returns count 0 when topicIds is empty and subtopicIds is undefined (RPC matches nothing)', async () => {
    setupAuthenticatedUser()
    // RPC is now always called; with topic_id = ANY('{}') the DB returns zero rows.
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: [],
      subtopicIds: undefined,
      filters: ['all'],
    })

    expect(result).toMatchObject({ count: 0 })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_topic_ids: [], p_subtopic_ids: null }),
    )
  })

  it('returns count 0 when subtopicIds is empty and topicIds is undefined (RPC matches nothing)', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: undefined,
      subtopicIds: [],
      filters: ['all'],
    })

    expect(result).toMatchObject({ count: 0 })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_topic_ids: null, p_subtopic_ids: [] }),
    )
  })

  it('returns count 0 when both topicIds and subtopicIds are empty arrays (RPC called with empty arrays)', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: [],
      subtopicIds: [],
      filters: ['all'],
    })

    expect(result).toMatchObject({ count: 0 })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_filtered_question_counts',
      expect.objectContaining({ p_topic_ids: [], p_subtopic_ids: [] }),
    )
  })
})
