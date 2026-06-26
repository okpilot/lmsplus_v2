import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({}),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { getRandomQuestionIds } from './quiz-session-queries'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockRpc.mockResolvedValue({ data: [], error: null })
})

describe('getRandomQuestionIds', () => {
  // Thin wrapper around get_random_question_ids RPC; pool selection lives in SQL (#678/#679/#668).
  it('returns mapped ids when rpc resolves with rows', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'a' }, { id: 'b' }],
      error: null,
    })

    const result = await getRandomQuestionIds({ subjectId: 's1', count: 2 })

    expect(result).toEqual(['a', 'b'])
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({
        p_subject_id: 's1',
        p_count: 2,
      }),
    )
  })

  it("strips 'all' from p_filters and keeps the remaining filter values", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({
      subjectId: 's1',
      count: 5,
      filters: ['all', 'unseen'],
    })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_filters: ['unseen'] }),
    )
  })

  it("passes p_filters as an empty array when filters is ['all']", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({ subjectId: 's1', count: 5, filters: ['all'] })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_filters: [] }),
    )
  })

  it("defaults p_calc_mode to 'all' when calcMode is omitted", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({ subjectId: 's1', count: 5 })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_calc_mode: 'all' }),
    )
  })

  it("passes p_calc_mode through literally (does NOT strip 'all')", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    // Unlike p_filters (where 'all' is stripped to []), calcMode is a literal enum —
    // 'all' must reach the RPC verbatim so its CASE resolves to the unrestricted pool.
    await getRandomQuestionIds({ subjectId: 's1', count: 5, calcMode: 'all' })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_calc_mode: 'all' }),
    )
  })

  it("defaults p_has_image to 'all' when imageMode is omitted", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({ subjectId: 's1', count: 5 })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_has_image: 'all' }),
    )
  })

  it("passes p_has_image through literally (does NOT strip 'all')", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    // imageMode is a literal enum — 'all' must reach the RPC verbatim so its CASE
    // resolves to the unrestricted pool. Same convention as p_calc_mode.
    await getRandomQuestionIds({ subjectId: 's1', count: 5, imageMode: 'all' })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_has_image: 'all' }),
    )
  })

  it("passes p_has_image as 'only' when imageMode is 'only'", async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({ subjectId: 's1', count: 5, imageMode: 'only' })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_has_image: 'only' }),
    )
  })

  it('passes p_filters as an empty array when filters is undefined', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({ subjectId: 's1', count: 5 })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_filters: [] }),
    )
  })

  it('sends p_topic_ids and p_subtopic_ids as null when the caller omits them', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({ subjectId: 's1', count: 5 })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_topic_ids: null, p_subtopic_ids: null }),
    )
  })

  it('passes p_topic_ids and p_subtopic_ids through when arrays are provided', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({
      subjectId: 's1',
      topicIds: ['t1', 't2'],
      subtopicIds: ['st1'],
      count: 5,
    })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({
        p_topic_ids: ['t1', 't2'],
        p_subtopic_ids: ['st1'],
      }),
    )
  })

  it('passes empty arrays through (empty array = match nothing in SQL)', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({
      subjectId: 's1',
      topicIds: [],
      subtopicIds: [],
      count: 5,
    })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_topic_ids: [], p_subtopic_ids: [] }),
    )
  })

  it('returns an empty array when rpc data is not an array', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await getRandomQuestionIds({ subjectId: 's1', count: 5 })).toEqual([])

    mockRpc.mockResolvedValueOnce({ data: { unexpected: true }, error: null })
    expect(await getRandomQuestionIds({ subjectId: 's1', count: 5 })).toEqual([])
  })

  it('drops rows without a string id from the result', async () => {
    // Defensive per-row filter — if the RPC ever returns malformed rows, undefined
    // must not leak into start_quiz_session's uuid[] argument.
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'a' }, null, { foo: 'bar' }, { id: 123 }, { id: 'b' }],
      error: null,
    })

    const result = await getRandomQuestionIds({ subjectId: 's1', count: 5 })

    expect(result).toEqual(['a', 'b'])
  })

  it('returns an empty array and logs when the rpc errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc boom' } })

    const result = await getRandomQuestionIds({ subjectId: 's1', count: 5 })

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[getRandomQuestionIds]'),
      'rpc boom',
    )
    consoleSpy.mockRestore()
  })

  it('defaults p_question_type to null when questionType is not provided', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({ subjectId: 's1', count: 5 })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_question_type: null }),
    )
  })

  it('passes the given question type to the RPC when questionType is specified', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    await getRandomQuestionIds({ subjectId: 's1', count: 5, questionType: 'multiple_choice' })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'get_random_question_ids',
      expect.objectContaining({ p_question_type: 'multiple_choice' }),
    )
  })
})
