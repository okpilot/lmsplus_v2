import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc, mockGetSubjects } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockGetSubjects: vi.fn(),
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

// ---- Subject under test ---------------------------------------------------

import { getDiscoveryCounts, sumFilteredCountRows } from './discovery-counts'

// ---- Fixtures -------------------------------------------------------------

const SUBJECTS = [
  { id: 's1', code: '010', name: 'Air Law', short: 'AL', questionCount: 9 },
  { id: 's2', code: '020', name: 'Nav', short: 'NAV', questionCount: 4 },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockGetSubjects.mockResolvedValue(SUBJECTS)
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
  it('counts the whole multiple-choice pool of every subject with the Discovery defaults', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    await getDiscoveryCounts()

    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_filtered_question_counts', {
      p_subject_id: 's1',
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: [],
      p_calc_mode: 'all',
      p_has_image: 'all',
      p_question_type: 'multiple_choice',
    })
    expect(mockRpc.mock.calls.map((c) => (c[2] as { p_subject_id: string }).p_subject_id)).toEqual([
      's1',
      's2',
    ])
  })

  it('keys the summed counts by subject id', async () => {
    mockRpc.mockImplementation(
      async (_s: unknown, _fn: string, args: { p_subject_id: string }) => ({
        data:
          args.p_subject_id === 's1'
            ? [{ topic_id: 't1', subtopic_id: 'st1', n: '6' }]
            : [{ topic_id: 't3', subtopic_id: null, n: 4 }],
        error: null,
      }),
    )

    const counts = await getDiscoveryCounts()

    expect(counts.s1).toEqual({ count: 6, byTopic: { t1: 6 }, bySubtopic: { st1: 6 } })
    expect(counts.s2).toEqual({ count: 4, byTopic: { t3: 4 }, bySubtopic: {} })
  })

  it('omits a subject whose count read failed and keeps the others', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockImplementation(async (_s: unknown, _fn: string, args: { p_subject_id: string }) =>
      args.p_subject_id === 's1'
        ? { data: null, error: { message: 'boom' } }
        : { data: [{ topic_id: 't3', subtopic_id: null, n: 4 }], error: null },
    )

    const counts = await getDiscoveryCounts()

    expect(Object.keys(counts)).toEqual(['s2'])
  })

  it('omits a subject whose count read returned a non-array payload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValue({ data: { oops: true }, error: null })

    expect(await getDiscoveryCounts()).toEqual({})
  })

  it('omits a subject whose count read rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockRejectedValue(new Error('network'))

    expect(await getDiscoveryCounts()).toEqual({})
  })

  it('rejects when the subject list cannot be read so the page falls back to per-subject counts', async () => {
    mockGetSubjects.mockRejectedValue(new Error('subjects failed'))

    await expect(getDiscoveryCounts()).rejects.toThrow('subjects failed')
  })
})
