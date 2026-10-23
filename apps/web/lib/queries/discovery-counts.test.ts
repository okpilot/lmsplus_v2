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

import { POSTGREST_MAX_ROWS } from '@/lib/supabase-paginate'
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

const row = (o: Partial<Record<string, unknown>>) => ({
  subject_id: 's1',
  topic_id: 't1',
  subtopic_id: 'st1',
  n_all: 0,
  n_unseen: 0,
  n_incorrect: 0,
  n_flagged: 0,
  n_incorrect_or_flagged: 0,
  ...o,
})

const SET_KEYS = ['', 'flagged', 'flagged,incorrect', 'incorrect', 'unseen']

describe('getDiscoveryCounts', () => {
  it('reads every subject and filter set with one argument-free count call', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    await getDiscoveryCounts()

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_discovery_counts', {})
  })

  it('keys the counts by subject id and filter set', async () => {
    mockRpc.mockResolvedValue({
      data: [
        row({
          n_all: 6,
          n_unseen: 5,
          n_incorrect: 2,
          n_flagged: 1,
          n_incorrect_or_flagged: 3,
        }),
        row({ topic_id: 't3', subtopic_id: null, subject_id: 's2', n_all: 2, n_unseen: 2 }),
      ],
      error: null,
    })

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts.s1 ?? {}).sort()).toEqual(SET_KEYS)
    expect(counts.s1?.['']).toEqual({ count: 6, byTopic: { t1: 6 }, bySubtopic: { st1: 6 } })
    expect(counts.s1?.unseen?.count).toBe(5)
    expect(counts.s1?.incorrect?.count).toBe(2)
    expect(counts.s1?.flagged?.count).toBe(1)
    expect(counts.s1?.['flagged,incorrect']).toEqual({
      count: 3,
      byTopic: { t1: 3 },
      bySubtopic: { st1: 3 },
    })
    expect(counts.s2?.unseen).toEqual({ count: 2, byTopic: { t3: 2 }, bySubtopic: {} })
  })

  it('sums rows of the same topic across subtopics', async () => {
    mockRpc.mockResolvedValue({
      data: [
        row({ subtopic_id: 'st1', n_all: 3 }),
        row({ subtopic_id: 'st2', n_all: 2 }),
        row({ subtopic_id: null, n_all: 4 }),
      ],
      error: null,
    })

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.['']).toEqual({
      count: 9,
      byTopic: { t1: 9 },
      bySubtopic: { st1: 3, st2: 2 },
    })
  })

  it('gives a subject with no matching rows zero counts for every filter set', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts).sort()).toEqual(['s1', 's2'])
    for (const id of ['s1', 's2']) {
      expect(Object.keys(counts[id] ?? {}).sort()).toEqual(SET_KEYS)
      expect(counts[id]?.['']).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
    }
  })

  it('leaves a topic out of a filter set whose count there is zero', async () => {
    mockRpc.mockResolvedValue({
      data: [row({ n_all: 4, n_unseen: 0 })],
      error: null,
    })

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.unseen).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
  })

  it('coerces bigint counts that arrive as strings', async () => {
    mockRpc.mockResolvedValue({ data: [row({ n_all: '7', n_unseen: '4' })], error: null })

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.['']?.count).toBe(7)
    expect(counts.s1?.unseen?.byTopic).toEqual({ t1: 4 })
  })

  it('ignores rows outside the subject topic tree', async () => {
    mockRpc.mockResolvedValue({
      data: [
        row({ n_all: 2 }),
        row({ subject_id: 's2', topic_id: 't3', subtopic_id: 'st4', n_all: 50 }),
        row({ subject_id: 's2', topic_id: 'tX', subtopic_id: null, n_all: 60 }),
      ],
      error: null,
    })

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.['']).toEqual({ count: 2, byTopic: { t1: 2 }, bySubtopic: { st1: 2 } })
    expect(counts.s2?.['']?.count).toBe(50)
  })

  it('counts a row whose topic is unknown but whose subtopic is in the tree', async () => {
    mockRpc.mockResolvedValue({
      data: [row({ topic_id: 'tX', subtopic_id: 'st3', n_all: 5 })],
      error: null,
    })

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.['']).toEqual({ count: 5, byTopic: { tX: 5 }, bySubtopic: { st3: 5 } })
  })

  it('drops malformed rows and keeps the valid ones', async () => {
    mockRpc.mockResolvedValue({
      data: [null, 'row', row({ topic_id: 5, n_all: 9 }), row({ n_all: 'abc' }), row({ n_all: 2 })],
      error: null,
    })

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.['']).toEqual({ count: 2, byTopic: { t1: 2 }, bySubtopic: { st1: 2 } })
  })

  it('returns no preloaded counts and logs when the count read fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    expect(await getDiscoveryCounts()).toEqual({})
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns no preloaded counts when the payload is not an array', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({ data: { oops: true }, error: null })

    expect(await getDiscoveryCounts()).toEqual({})
  })

  it('returns no preloaded counts when the payload may be truncated at the row cap', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({
      data: Array.from({ length: POSTGREST_MAX_ROWS }, () => row({ n_all: 1 })),
      error: null,
    })

    expect(await getDiscoveryCounts()).toEqual({})
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns no preloaded counts when the count read rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockRejectedValue(new Error('network'))

    expect(await getDiscoveryCounts()).toEqual({})
  })

  it('rejects when the subject list cannot be read so the page falls back to per-subject counts', async () => {
    mockGetSubjects.mockRejectedValue(new Error('subjects failed'))

    await expect(getDiscoveryCounts()).rejects.toThrow('subjects failed')
  })

  it('skips a subject that has no topic tree', async () => {
    mockGetTrees.mockResolvedValue({ s2: TREES.s2 })
    mockRpc.mockResolvedValue({
      data: [
        row({ n_all: 9 }),
        row({ subject_id: 's2', topic_id: 't3', subtopic_id: null, n_all: 1 }),
      ],
      error: null,
    })

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts)).toEqual(['s2'])
  })

  it('rejects when the topic trees cannot be read so the page falls back to per-subject counts', async () => {
    mockGetTrees.mockRejectedValue(new Error('trees failed'))

    await expect(getDiscoveryCounts()).rejects.toThrow('trees failed')
  })
})
