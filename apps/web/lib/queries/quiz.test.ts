import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import {
  getRandomQuestionIds,
  getSubjectsWithCounts,
  getSubtopicsForTopic,
  getTopicsForSubject,
  getTopicsWithSubtopics,
} from './quiz'

// ---- Helpers --------------------------------------------------------------

/** Builds a fluent chain stub: from().select().eq()...returns() */
function buildChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {}
  const proxy = new Proxy(chain, {
    get(_, prop) {
      if (prop === 'then') return undefined // not a Promise itself
      return (..._args: unknown[]) => proxy
    },
  })
  // Override the terminal resolution when awaited
  // We need awaitable: attach a custom .then on a wrapper
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const terminalProxy = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => terminalProxy
    },
  })
  return terminalProxy
}

/** Creates a sequence of from() calls that return different values. */
function mockFromSequence(...responses: unknown[]) {
  let call = 0
  mockFrom.mockImplementation(() => buildChain(responses[call++] ?? { data: null }))
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockRpc.mockResolvedValue({ data: [], error: null })
})

describe('getSubjectsWithCounts', () => {
  it('returns subjects with question counts aggregated by subject_id', async () => {
    mockFromSequence({
      data: [
        {
          id: 's1',
          code: 'AGK',
          name: 'Aircraft General Knowledge',
          short: 'AGK',
          sort_order: 1,
        },
        { id: 's2', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 2 },
      ],
    })
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st1', n: 1 },
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st2', n: 1 },
        { subject_id: 's2', topic_id: 't2', subtopic_id: null, n: 1 },
      ],
      error: null,
    })

    const result = await getSubjectsWithCounts()
    expect(result).toHaveLength(2)
    expect(result.find((s) => s.id === 's1')?.questionCount).toBe(2)
    expect(result.find((s) => s.id === 's2')?.questionCount).toBe(1)
  })

  it('sums string-encoded bigint counts numerically, not by concatenation', async () => {
    // PostgREST serializes COUNT(*)::bigint as a JSON string; the helper coerces
    // with Number() so '1' + '2' must total 3, not the '12' string artifact.
    mockFromSequence({
      data: [{ id: 's1', code: 'AGK', name: 'AGK', short: 'AGK', sort_order: 1 }],
    })
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st1', n: '1' },
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st2', n: '2' },
      ],
      error: null,
    })

    const result = await getSubjectsWithCounts()
    expect(result.find((s) => s.id === 's1')?.questionCount).toBe(3)
  })

  it('returns empty array when no subjects exist', async () => {
    mockFromSequence({ data: [] })
    const result = await getSubjectsWithCounts()
    expect(result).toEqual([])
  })

  it('filters out subjects with zero questions', async () => {
    mockFromSequence({
      data: [
        { id: 's1', code: 'AGK', name: 'AGK', short: 'AGK', sort_order: 1 },
        { id: 's2', code: 'MET', name: 'MET', short: 'MET', sort_order: 2 },
      ],
    })
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: 't1', subtopic_id: null, n: 1 }],
      error: null,
    })

    const result = await getSubjectsWithCounts()
    expect(result).toHaveLength(1)
    // Test setup guarantees at least one subject in result
    expect(result[0]!.id).toBe('s1')
  })

  it('returns empty array when subjects data is null', async () => {
    mockFromSequence({ data: null })
    const result = await getSubjectsWithCounts()
    expect(result).toEqual([])
  })
})

describe('getTopicsForSubject', () => {
  it('returns topics with question counts for the given subject', async () => {
    mockFromSequence({
      data: [
        { id: 't1', code: '050-01', name: 'Airframe', sort_order: 1 },
        { id: 't2', code: '050-02', name: 'Engines', sort_order: 2 },
      ],
    })
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st1', n: 1 },
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st2', n: 1 },
        { subject_id: 's1', topic_id: 't2', subtopic_id: null, n: 1 },
        { subject_id: 's-other', topic_id: 't1', subtopic_id: null, n: 99 },
      ],
      error: null,
    })

    const result = await getTopicsForSubject('s1')
    expect(result).toHaveLength(2)
    expect(result.find((t) => t.id === 't1')?.questionCount).toBe(2)
    expect(result.find((t) => t.id === 't2')?.questionCount).toBe(1)
  })

  it('returns empty array when no topics exist for subject', async () => {
    mockFromSequence({ data: [] })
    const result = await getTopicsForSubject('s-nonexistent')
    expect(result).toEqual([])
  })

  it('filters out topics with zero questions', async () => {
    mockFromSequence({ data: [{ id: 't1', code: '050-01', name: 'Airframe', sort_order: 1 }] })
    // rpc default → no counts → t1 filtered out

    const result = await getTopicsForSubject('s1')
    expect(result).toHaveLength(0)
  })
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
})

describe('getSubtopicsForTopic', () => {
  it('returns subtopics with question counts for the given topic', async () => {
    mockFromSequence({
      data: [
        { id: 'st1', code: '050-01-01', name: 'Lift', sort_order: 1 },
        { id: 'st2', code: '050-01-02', name: 'Drag', sort_order: 2 },
      ],
    })
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st1', n: 1 },
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st1', n: 1 },
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st2', n: 1 },
        { subject_id: 's1', topic_id: 't-other', subtopic_id: 'st1', n: 99 },
      ],
      error: null,
    })

    const result = await getSubtopicsForTopic('t1')
    expect(result).toHaveLength(2)
    expect(result.find((st) => st.id === 'st1')?.questionCount).toBe(2)
    expect(result.find((st) => st.id === 'st2')?.questionCount).toBe(1)
  })

  it('returns empty array when no subtopics exist for topic', async () => {
    mockFromSequence({ data: [] })
    const result = await getSubtopicsForTopic('t-nonexistent')
    expect(result).toEqual([])
  })

  it('filters out subtopics with zero questions', async () => {
    mockFromSequence({ data: [{ id: 'st1', code: '050-01-01', name: 'Lift', sort_order: 1 }] })
    // rpc default → st1 filtered out

    const result = await getSubtopicsForTopic('t1')
    expect(result).toHaveLength(0)
  })
})

describe('getTopicsWithSubtopics', () => {
  it('returns topics with their subtopics and question counts', async () => {
    mockFromSequence(
      { data: [{ id: 't1', code: '050-01', name: 'Aerodynamics', sort_order: 1 }] },
      { data: [{ id: 'st1', code: '050-01-01', name: 'Lift', sort_order: 1, topic_id: 't1' }] },
    )
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: 't1', subtopic_id: 'st1', n: 1 },
        { subject_id: 's1', topic_id: 't1', subtopic_id: null, n: 1 },
      ],
      error: null,
    })

    const result = await getTopicsWithSubtopics('s1')
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('t1')
    expect(result[0]!.questionCount).toBe(2)
    expect(result[0]!.subtopics).toHaveLength(1)
    expect(result[0]!.subtopics[0]!.id).toBe('st1')
    expect(result[0]!.subtopics[0]!.questionCount).toBe(1)
  })

  it('returns empty array when no topics exist for subject', async () => {
    mockFromSequence({ data: [] })
    const result = await getTopicsWithSubtopics('s-none')
    expect(result).toEqual([])
  })

  it('filters out topics with zero questions', async () => {
    mockFromSequence(
      { data: [{ id: 't1', code: '050-01', name: 'Aerodynamics', sort_order: 1 }] },
      { data: [] },
    )
    // rpc default → t1 count 0 → filtered

    const result = await getTopicsWithSubtopics('s1')
    expect(result).toHaveLength(0)
  })

  it('omits subtopics with zero questions from the topic subtopics list', async () => {
    mockFromSequence(
      { data: [{ id: 't1', code: '050-01', name: 'Aerodynamics', sort_order: 1 }] },
      {
        data: [
          { id: 'st1', code: '050-01-01', name: 'Lift', sort_order: 1, topic_id: 't1' },
          { id: 'st2', code: '050-01-02', name: 'Drag', sort_order: 2, topic_id: 't1' },
        ],
      },
    )
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: 't1', subtopic_id: 'st1', n: 1 }],
      error: null,
    })

    const result = await getTopicsWithSubtopics('s1')
    expect(result).toHaveLength(1)
    expect(result[0]!.subtopics).toHaveLength(1)
    expect(result[0]!.subtopics[0]!.id).toBe('st1')
  })
})

// ---- fetchActiveQuestionCounts error / guard paths -------------------------
// These tests exercise the shared helper via the 4 public count functions.
// One RPC-error test per function (each exercises a distinct call site) and
// one non-array-payload test on getSubjectsWithCounts (the guard is shared).

describe('getSubjectsWithCounts — RPC error from get_question_counts', () => {
  it('returns empty array when the counts RPC fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFromSequence({
      data: [{ id: 's1', code: 'AGK', name: 'AGK', short: 'AGK', sort_order: 1 }],
    })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })

    const result = await getSubjectsWithCounts()
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchActiveQuestionCounts] get_question_counts error:',
      'rpc boom',
    )
    consoleSpy.mockRestore()
  })

  it('returns empty array when the counts RPC returns a non-array payload', async () => {
    mockFromSequence({
      data: [{ id: 's1', code: 'AGK', name: 'AGK', short: 'AGK', sort_order: 1 }],
    })
    // data is a plain object (not an array) — the Array.isArray guard yields []
    mockRpc.mockResolvedValue({ data: { unexpected: true }, error: null })

    const result = await getSubjectsWithCounts()
    // countMap stays empty → all subjects get questionCount 0 → filtered out
    expect(result).toEqual([])
  })
})

describe('getTopicsForSubject — RPC error from get_question_counts', () => {
  it('returns empty array when the counts RPC fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFromSequence({
      data: [{ id: 't1', code: '050-01', name: 'Airframe', sort_order: 1 }],
    })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })

    const result = await getTopicsForSubject('s1')
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchActiveQuestionCounts] get_question_counts error:',
      'rpc boom',
    )
    consoleSpy.mockRestore()
  })
})

describe('getSubtopicsForTopic — RPC error from get_question_counts', () => {
  it('returns empty array when the counts RPC fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFromSequence({
      data: [{ id: 'st1', code: '050-01-01', name: 'Lift', sort_order: 1 }],
    })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })

    const result = await getSubtopicsForTopic('t1')
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchActiveQuestionCounts] get_question_counts error:',
      'rpc boom',
    )
    consoleSpy.mockRestore()
  })
})

describe('getTopicsWithSubtopics — RPC error from get_question_counts', () => {
  it('returns empty array when the counts RPC fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFromSequence(
      { data: [{ id: 't1', code: '050-01', name: 'Aerodynamics', sort_order: 1 }] },
      { data: [{ id: 'st1', code: '050-01-01', name: 'Lift', sort_order: 1, topic_id: 't1' }] },
    )
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })

    const result = await getTopicsWithSubtopics('s1')
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchActiveQuestionCounts] get_question_counts error:',
      'rpc boom',
    )
    consoleSpy.mockRestore()
  })
})
