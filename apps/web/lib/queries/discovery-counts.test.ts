import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { clientHolder, mockGetSubjects, mockGetTrees } = vi.hoisted(() => ({
  clientHolder: { current: undefined as unknown },
  mockGetSubjects: vi.fn(),
  mockGetTrees: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => clientHolder.current,
}))

vi.mock('./quiz-subject-queries', () => ({
  getSubjectsWithCounts: () => mockGetSubjects(),
}))

vi.mock('./quiz-topic-trees', () => ({
  getAllTopicTrees: () => mockGetTrees(),
}))

// ---- Subject under test ---------------------------------------------------

import { POSTGREST_MAX_ROWS } from '@/lib/supabase-paginate'
import {
  type ChainableRpcClient,
  type ChainableRpcClientFixture,
  createChainableRpcClient,
} from '@/lib/test-support/chainable-rpc-client'
import { getDiscoveryCounts, sumFilteredCountRows } from './discovery-counts'
import { filterSetKey, PRELOADED_FILTER_SETS } from './filtered-count-keys'

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

/** Installs a chainable RPC client whose unpaged call resolves to `data`. */
function useRows(
  data: unknown,
  fixture: Partial<ChainableRpcClientFixture> = {},
): ChainableRpcClient {
  const client = createChainableRpcClient({ firstCall: { data, error: null }, ...fixture })
  clientHolder.current = { rpc: client.rpc }
  return client
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
    const client = useRows([])

    await getDiscoveryCounts()

    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith('get_discovery_counts', undefined)
    expect(client.rangeCalls).toEqual([])
    expect(client.orderCalls).toEqual([])
  })

  it('pages the count read in key order when the first call returns exactly the row cap', async () => {
    const extra = 3
    const client = useRows(
      Array.from({ length: POSTGREST_MAX_ROWS }, () => row({ n_all: 100 })),
      {
        count: { count: POSTGREST_MAX_ROWS + extra, error: null },
        pages: [
          { data: Array.from({ length: POSTGREST_MAX_ROWS }, () => row({ n_all: 1 })) },
          { data: Array.from({ length: extra }, () => row({ n_all: 1 })) },
        ],
      },
    )

    const counts = await getDiscoveryCounts()

    expect(client.rangeCalls).toEqual([
      [0, POSTGREST_MAX_ROWS - 1],
      [POSTGREST_MAX_ROWS, POSTGREST_MAX_ROWS + extra - 1],
    ])
    expect(client.orderCalls.map(([column]) => column)).toEqual([
      'subject_id',
      'topic_id',
      'subtopic_id',
      'subject_id',
      'topic_id',
      'subtopic_id',
    ])
    expect(counts.s1?.['']?.count).toBe(POSTGREST_MAX_ROWS + extra)
  })

  it('keys each subject by every preloaded filter set', async () => {
    useRows([])

    const counts = await getDiscoveryCounts()

    const expected = PRELOADED_FILTER_SETS.map(filterSetKey).sort()
    expect(Object.keys(counts.s1 ?? {}).sort()).toEqual(expected)
    expect(Object.keys(counts.s2 ?? {}).sort()).toEqual(expected)
  })

  it('keys the counts by subject id and filter set', async () => {
    useRows([
      row({
        n_all: 6,
        n_unseen: 5,
        n_incorrect: 2,
        n_flagged: 1,
        n_incorrect_or_flagged: 3,
      }),
      row({ topic_id: 't3', subtopic_id: null, subject_id: 's2', n_all: 2, n_unseen: 2 }),
    ])

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
    useRows([
      row({ subtopic_id: 'st1', n_all: 3 }),
      row({ subtopic_id: 'st2', n_all: 2 }),
      row({ subtopic_id: null, n_all: 4 }),
    ])

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.['']).toEqual({
      count: 9,
      byTopic: { t1: 9 },
      bySubtopic: { st1: 3, st2: 2 },
    })
  })

  it('gives a subject with no matching rows zero counts for every filter set', async () => {
    useRows([])

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts).sort()).toEqual(['s1', 's2'])
    for (const id of ['s1', 's2']) {
      expect(Object.keys(counts[id] ?? {}).sort()).toEqual(SET_KEYS)
      expect(counts[id]?.['']).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
    }
  })

  it('leaves a topic out of a filter set whose count there is zero', async () => {
    useRows([row({ n_all: 4, n_unseen: 0 })])

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.unseen).toEqual({ count: 0, byTopic: {}, bySubtopic: {} })
  })

  it('coerces bigint counts that arrive as strings', async () => {
    useRows([row({ n_all: '7', n_unseen: '4' })])

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.['']?.count).toBe(7)
    expect(counts.s1?.unseen?.byTopic).toEqual({ t1: 4 })
  })

  it('ignores rows outside the subject topic tree', async () => {
    useRows([
      row({ n_all: 2 }),
      row({ subject_id: 's2', topic_id: 't3', subtopic_id: 'st4', n_all: 50 }),
      row({ subject_id: 's2', topic_id: 'tX', subtopic_id: null, n_all: 60 }),
    ])

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.['']).toEqual({ count: 2, byTopic: { t1: 2 }, bySubtopic: { st1: 2 } })
    expect(counts.s2?.['']?.count).toBe(50)
  })

  it('counts a row whose topic is unknown but whose subtopic is in the tree', async () => {
    useRows([row({ topic_id: 'tX', subtopic_id: 'st3', n_all: 5 })])

    const counts = await getDiscoveryCounts()

    expect(counts.s1?.['']).toEqual({ count: 5, byTopic: { tX: 5 }, bySubtopic: { st3: 5 } })
  })

  it('returns no preloaded counts and logs when any row is malformed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useRows([row({ n_all: 2 }), row({ n_all: 'abc' })])

    expect(await getDiscoveryCounts()).toEqual({})
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns no preloaded counts and logs when the count read fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useRows(null, { firstCall: { data: null, error: { message: 'boom' } } })

    expect(await getDiscoveryCounts()).toEqual({})
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns no preloaded counts and logs when a page read fails after the count succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useRows(
      Array.from({ length: POSTGREST_MAX_ROWS }, () => row({ n_all: 1 })),
      {
        count: { count: POSTGREST_MAX_ROWS + 1, error: null },
        pages: [{ data: null, error: { message: 'page boom' } }],
      },
    )

    expect(await getDiscoveryCounts()).toEqual({})
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns no preloaded counts when the payload is not an array', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useRows({ oops: true })

    expect(await getDiscoveryCounts()).toEqual({})
  })

  it('returns no preloaded counts when the count read rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    clientHolder.current = { rpc: vi.fn().mockRejectedValue(new Error('network')) }

    expect(await getDiscoveryCounts()).toEqual({})
  })

  it('rejects when the subject list cannot be read so the page falls back to per-subject counts', async () => {
    mockGetSubjects.mockRejectedValue(new Error('subjects failed'))

    await expect(getDiscoveryCounts()).rejects.toThrow('subjects failed')
  })

  it('skips a subject that has no topic tree', async () => {
    mockGetTrees.mockResolvedValue({ s2: TREES.s2 })
    useRows([
      row({ n_all: 9 }),
      row({ subject_id: 's2', topic_id: 't3', subtopic_id: null, n_all: 1 }),
    ])

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts)).toEqual(['s2'])
  })

  it('rejects when the topic trees cannot be read so the page falls back to per-subject counts', async () => {
    mockGetTrees.mockRejectedValue(new Error('trees failed'))

    await expect(getDiscoveryCounts()).rejects.toThrow('trees failed')
  })
})
