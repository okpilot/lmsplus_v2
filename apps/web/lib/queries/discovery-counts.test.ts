import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc, mockGetSubjects, mockGetTrees } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockGetSubjects: vi.fn(),
  mockGetTrees: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({}),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

vi.mock('./quiz-subject-queries', () => ({
  getSubjectsWithCounts: () => mockGetSubjects(),
}))

vi.mock('./quiz-topic-trees', () => ({
  getAllTopicTrees: () => mockGetTrees(),
}))

// ---- Subject under test ---------------------------------------------------

import { getDiscoveryCounts, sumFilteredCountRows } from './discovery-counts'

// ---- Fixtures -------------------------------------------------------------

const SUBJECTS = [
  { id: 's1', code: '010', name: 'Air Law', short: 'AL', questionCount: 9 },
  { id: 's2', code: '020', name: 'Nav', short: 'NAV', questionCount: 4 },
]

const tree = (topicId: string, subtopicIds: string[]) => ({
  id: topicId,
  code: topicId,
  name: topicId,
  questionCount: 1,
  subtopics: subtopicIds.map((id) => ({ id, code: id, name: id, questionCount: 1 })),
})

const TREES = {
  s1: [tree('t1', ['st1', 'st2']), tree('t2', ['st3'])],
  s2: [tree('t3', ['st4'])],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetSubjects.mockResolvedValue(SUBJECTS)
  mockGetTrees.mockResolvedValue(TREES)
})

describe('sumFilteredCountRows', () => {
  it('totals rows per topic and per subtopic', () => {
    const result = sumFilteredCountRows([
      { topic_id: 't1', subtopic_id: 'st1', n: 3 },
      { topic_id: 't1', subtopic_id: 'st2', n: '2' },
      { topic_id: 't2', subtopic_id: null, n: 4 },
    ])

    expect(result).toEqual({
      count: 9,
      byTopic: { t1: 5, t2: 4 },
      bySubtopic: { st1: 3, st2: 2 },
    })
  })

  it('skips malformed rows and keeps the valid ones', () => {
    const result = sumFilteredCountRows([
      null,
      'row',
      { topic_id: 5, subtopic_id: null, n: 1 },
      { topic_id: 't1', subtopic_id: null, n: 'abc' },
      { topic_id: 't1', subtopic_id: null, n: 2 },
    ])

    expect(result).toEqual({ count: 2, byTopic: { t1: 2 }, bySubtopic: {} })
  })

  it('returns zero counts for no rows', () => {
    expect(sumFilteredCountRows([])).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
  })
})

describe('getDiscoveryCounts', () => {
  it('counts every subject for each preloaded student filter set with the Discovery defaults', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    await getDiscoveryCounts()

    expect(mockRpc).toHaveBeenCalledTimes(10)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_filtered_question_counts', {
      p_subject_id: 's1',
      p_topic_ids: ['t1', 't2'],
      p_subtopic_ids: ['st1', 'st2', 'st3'],
      p_filters: [],
      p_calc_mode: 'all',
      p_has_image: 'all',
      p_question_type: 'multiple_choice',
    })
    const filtersBySubject = mockRpc.mock.calls.map((c) => {
      const a = c[2] as { p_subject_id: string; p_filters: string[] }
      return `${a.p_subject_id}:${a.p_filters.join('+')}`
    })
    expect(filtersBySubject.sort()).toEqual(
      ['s1', 's2']
        .flatMap((id) =>
          ['', 'unseen', 'incorrect', 'flagged', 'incorrect+flagged'].map((f) => `${id}:${f}`),
        )
        .sort(),
    )
  })

  it('keys the summed counts by subject id and filter set', async () => {
    mockRpc.mockImplementation(
      async (_s: unknown, _fn: string, args: { p_subject_id: string; p_filters: string[] }) => {
        const n = args.p_filters.length + 1
        return {
          data:
            args.p_subject_id === 's1'
              ? [{ topic_id: 't1', subtopic_id: 'st1', n: String(6 * n) }]
              : [{ topic_id: 't3', subtopic_id: null, n }],
          error: null,
        }
      },
    )

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts.s1 ?? {}).sort()).toEqual(
      ['', 'flagged', 'incorrect', 'flagged,incorrect', 'unseen'].sort(),
    )
    expect(counts.s1?.['']).toEqual({ count: 6, byTopic: { t1: 6 }, bySubtopic: { st1: 6 } })
    expect(counts.s1?.['flagged,incorrect']).toEqual({
      count: 18,
      byTopic: { t1: 18 },
      bySubtopic: { st1: 18 },
    })
    expect(counts.s2?.unseen).toEqual({ count: 2, byTopic: { t3: 2 }, bySubtopic: {} })
  })

  it('omits only the filter set whose count read failed and logs it', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockImplementation(async (_s: unknown, _fn: string, args: { p_filters: string[] }) =>
      args.p_filters[0] === 'flagged' && args.p_filters.length === 1
        ? { data: null, error: { message: 'boom' } }
        : { data: [{ topic_id: 't3', subtopic_id: null, n: 4 }], error: null },
    )

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts.s1 ?? {}).sort()).toEqual([
      '',
      'flagged,incorrect',
      'incorrect',
      'unseen',
    ])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('omits a subject whose every count read failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockImplementation(async (_s: unknown, _fn: string, args: { p_subject_id: string }) =>
      args.p_subject_id === 's1'
        ? { data: null, error: { message: 'boom' } }
        : { data: [{ topic_id: 't3', subtopic_id: null, n: 4 }], error: null },
    )

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts)).toEqual(['s2'])
  })

  it('omits a subject whose count reads returned a non-array payload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({ data: { oops: true }, error: null })

    expect(await getDiscoveryCounts()).toEqual({})
  })

  it('omits a subject whose count reads reject', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockRejectedValue(new Error('network'))

    expect(await getDiscoveryCounts()).toEqual({})
  })

  it('rejects when the subject list cannot be read so the page falls back to per-subject counts', async () => {
    mockGetSubjects.mockRejectedValue(new Error('subjects failed'))

    await expect(getDiscoveryCounts()).rejects.toThrow('subjects failed')
  })

  it('sends the subject topic and subtopic ids of its tree with every count', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    await getDiscoveryCounts()

    const argsBySubject = new Map(
      mockRpc.mock.calls.map((c) => {
        const a = c[2] as { p_subject_id: string; p_topic_ids: unknown; p_subtopic_ids: unknown }
        return [a.p_subject_id, [a.p_topic_ids, a.p_subtopic_ids]] as const
      }),
    )
    expect(argsBySubject.get('s1')).toEqual([
      ['t1', 't2'],
      ['st1', 'st2', 'st3'],
    ])
    expect(argsBySubject.get('s2')).toEqual([['t3'], ['st4']])
  })

  it('skips a subject that has no topic tree', async () => {
    mockGetTrees.mockResolvedValue({ s2: TREES.s2 })
    mockRpc.mockResolvedValue({ data: [{ topic_id: 't3', subtopic_id: null, n: 1 }], error: null })

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts)).toEqual(['s2'])
    expect(
      mockRpc.mock.calls.every((c) => (c[2] as { p_subject_id: string }).p_subject_id === 's2'),
    ).toBe(true)
  })

  it('rejects when the topic trees cannot be read so the page falls back to per-subject counts', async () => {
    mockGetTrees.mockRejectedValue(new Error('trees failed'))

    await expect(getDiscoveryCounts()).rejects.toThrow('trees failed')
  })
})
