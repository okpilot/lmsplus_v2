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

import { getProgressData } from './progress'

// ---- Helpers --------------------------------------------------------------

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockRpc.mockResolvedValue({ data: [], error: null })
})

describe('getProgressData', () => {
  it('throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getProgressData()).rejects.toThrow('Not authenticated')
  })

  it('throws when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session not found' },
    })
    await expect(getProgressData()).rejects.toThrow('Auth error: session not found')
  })

  it('throws when the mastery-stats RPC returns an error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'easa_topics') return buildChain({ data: [] })
      return buildChain({ data: null })
    })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getProgressData()).rejects.toThrow('Failed to fetch mastery stats: boom')
  })

  it('returns empty array when there are no subjects', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'easa_topics') return buildChain({ data: [] })
      return buildChain({ data: null })
    })

    const result = await getProgressData()
    expect(result).toEqual([])
  })

  it('calculates masteryPercentage per subject based on correct responses', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'easa_topics')
        return buildChain({
          data: [{ id: 't1', code: '050-01', name: 'Airframe', subject_id: 's1', sort_order: 1 }],
        })
      return buildChain({ data: null })
    })
    // 4 active questions, 2 answered correctly -> 50%
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: 4, correct: 2 }],
      error: null,
    })

    const result = await getProgressData()
    expect(result).toHaveLength(1)
    // Test setup guarantees one subject in result
    expect(result[0]!.totalQuestions).toBe(4)
    expect(result[0]!.answeredCorrectly).toBe(2)
    expect(result[0]!.masteryPercentage).toBe(50)
  })

  it('includes topic breakdown within each subject', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'easa_topics')
        return buildChain({
          data: [
            { id: 't1', code: '050-01', name: 'Airframe', subject_id: 's1', sort_order: 1 },
            { id: 't2', code: '050-02', name: 'Engines', subject_id: 's1', sort_order: 2 },
          ],
        })
      return buildChain({ data: null })
    })
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: null, total: 2, correct: 1 },
        { subject_id: 's1', topic_id: 't1', total: 1, correct: 1 },
        { subject_id: 's1', topic_id: 't2', total: 1, correct: 0 },
      ],
      error: null,
    })

    const result = await getProgressData()
    // Test setup guarantees one subject with two topics in result
    expect(result[0]!.topics).toHaveLength(2)
    const t1 = result[0]!.topics.find((t) => t.id === 't1')!
    const t2 = result[0]!.topics.find((t) => t.id === 't2')!
    expect(t1.masteryPercentage).toBe(100) // 1 of 1 correct
    expect(t2.masteryPercentage).toBe(0) // 0 of 1 correct
  })

  it('filters out subjects with zero questions AND zero responses', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [
            { id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 },
            { id: 's2', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 2 },
          ],
        })
      if (table === 'easa_topics') return buildChain({ data: [] })
      return buildChain({ data: null })
    })
    // Only s1 has counts; s2 has none and must be filtered out.
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: 1, correct: 0 }],
      error: null,
    })

    const result = await getProgressData()
    expect(result.every((s) => s.totalQuestions > 0)).toBe(true)
    expect(result.find((s) => s.id === 's2')).toBeUndefined()
  })

  it('keeps subject when it has no active questions but the student has correct responses to it', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AIRLAW', name: 'Air Law', short: 'AIR', sort_order: 1 }],
        })
      if (table === 'easa_topics') return buildChain({ data: [] })
      return buildChain({ data: null })
    })
    // Orphan subject: 0 active questions but 1 correct response retained.
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: 0, correct: 1 }],
      error: null,
    })

    const result = await getProgressData()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('s1')
    expect(result[0]!.totalQuestions).toBe(0)
    expect(result[0]!.answeredCorrectly).toBe(1)
    expect(result[0]!.masteryPercentage).toBe(0)
  })

  it('keeps topic when it has no active questions but the student has correct responses to it', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AIRLAW', name: 'Air Law', short: 'AIR', sort_order: 1 }],
        })
      if (table === 'easa_topics')
        return buildChain({
          data: [
            { id: 't1', code: 'TOP1', name: 'Topic 1', subject_id: 's1', sort_order: 1 },
            { id: 't2', code: 'TOP2', name: 'Topic 2', subject_id: 's1', sort_order: 2 },
          ],
        })
      return buildChain({ data: null })
    })
    // Subject has 1 active question; t2 is an orphan topic (0 active, 1 correct).
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: null, total: 1, correct: 1 },
        { subject_id: 's1', topic_id: 't1', total: 1, correct: 0 },
        { subject_id: 's1', topic_id: 't2', total: 0, correct: 1 },
      ],
      error: null,
    })

    const result = await getProgressData()
    expect(result).toHaveLength(1)
    expect(result[0]!.totalQuestions).toBe(1)
    expect(result[0]!.answeredCorrectly).toBe(1)

    const t2 = result[0]!.topics.find((t) => t.id === 't2')
    expect(t2).toBeDefined()
    expect(t2!.totalQuestions).toBe(0)
    expect(t2!.answeredCorrectly).toBe(1)
    expect(t2!.masteryPercentage).toBe(0)
  })

  it('counts active and draft question responses separately at the topic level', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 1 }],
        })
      if (table === 'easa_topics')
        return buildChain({
          data: [{ id: 't1', code: 'MET-01', name: 'Atmosphere', subject_id: 's1', sort_order: 1 }],
        })
      return buildChain({ data: null })
    })
    // 1 active question, 1 correct response (to a now-draft question) -> 100%.
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: null, total: 1, correct: 1 },
        { subject_id: 's1', topic_id: 't1', total: 1, correct: 1 },
      ],
      error: null,
    })

    const result = await getProgressData()
    expect(result).toHaveLength(1)
    const topic = result[0]!.topics.find((t) => t.id === 't1')!
    expect(topic.totalQuestions).toBe(1)
    expect(topic.answeredCorrectly).toBe(1)
    expect(topic.masteryPercentage).toBe(100)
    expect(result[0]!.totalQuestions).toBe(1)
    expect(result[0]!.answeredCorrectly).toBe(1)
  })

  it('sets masteryPercentage to 0 when a subject has questions but none answered correctly', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'easa_topics') return buildChain({ data: [] })
      return buildChain({ data: null })
    })
    // 1 active question, no correct responses.
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: 1, correct: 0 }],
      error: null,
    })

    const result = await getProgressData()
    // Test setup guarantees at least one subject in result
    expect(result[0]!.masteryPercentage).toBe(0)
    expect(result[0]!.answeredCorrectly).toBe(0)
  })

  it('caps masteryPercentage at 100 while keeping the raw correct count when orphan responses exceed active questions', async () => {
    // #540/#664: topic t1 has 1 active + 1 now-draft question; the student answered
    // BOTH correctly. answeredCorrectly (2) stays raw (orphan-retention signal), but
    // the derived percentage must not exceed 100.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 1 }],
        })
      if (table === 'easa_topics')
        return buildChain({
          data: [{ id: 't1', code: 'MET-01', name: 'Atmosphere', subject_id: 's1', sort_order: 1 }],
        })
      return buildChain({ data: null })
    })
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: null, total: 1, correct: 2 },
        { subject_id: 's1', topic_id: 't1', total: 1, correct: 2 },
      ],
      error: null,
    })

    const result = await getProgressData()
    const topic = result[0]!.topics.find((t) => t.id === 't1')!
    expect(topic.totalQuestions).toBe(1)
    expect(topic.answeredCorrectly).toBe(2)
    expect(topic.masteryPercentage).toBe(100)
    expect(result[0]!.totalQuestions).toBe(1)
    expect(result[0]!.answeredCorrectly).toBe(2)
    expect(result[0]!.masteryPercentage).toBe(100)
  })

  it('surfaces a high-volume subject at full count without 1000-row truncation', async () => {
    // #540 regression: under the old unpaginated client reads, a subject whose
    // active questions / correct responses fell outside the first 1000 rows showed
    // 0% mastery. The RPC aggregates in Postgres, so the full count survives.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's_tail', code: 'AIRLAW', name: 'Air Law', short: 'AIR', sort_order: 1 }],
        })
      if (table === 'easa_topics') return buildChain({ data: [] })
      return buildChain({ data: null })
    })
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's_tail', topic_id: null, total: 1366, correct: 1366 }],
      error: null,
    })

    const result = await getProgressData()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('s_tail')
    expect(result[0]!.totalQuestions).toBe(1366)
    expect(result[0]!.answeredCorrectly).toBe(1366)
    expect(result[0]!.masteryPercentage).toBe(100)
  })

  it('coerces bigint-as-string total and correct at both subject and topic level', async () => {
    // PostgREST may return bigint columns as strings. The MasteryRow type declares
    // `total: number | string`; production code calls Number() before arithmetic.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'easa_topics')
        return buildChain({
          data: [{ id: 't1', code: '050-01', name: 'Airframe', subject_id: 's1', sort_order: 1 }],
        })
      return buildChain({ data: null })
    })
    mockRpc.mockResolvedValue({
      data: [
        // Strings instead of numbers — simulates the bigint-as-string driver path.
        { subject_id: 's1', topic_id: null, total: '8', correct: '4' },
        { subject_id: 's1', topic_id: 't1', total: '8', correct: '4' },
      ],
      error: null,
    })

    const result = await getProgressData()
    expect(result).toHaveLength(1)
    expect(result[0]!.totalQuestions).toBe(8)
    expect(result[0]!.answeredCorrectly).toBe(4)
    expect(result[0]!.masteryPercentage).toBe(50)
    const topic = result[0]!.topics.find((t) => t.id === 't1')!
    expect(topic.totalQuestions).toBe(8)
    expect(topic.answeredCorrectly).toBe(4)
    expect(topic.masteryPercentage).toBe(50)
  })

  it('returns active and orphan subjects side by side without cross-contaminating their counts', async () => {
    // Two subjects in one RPC result: s1 is active (total > 0), s2 is an orphan
    // (total: 0, correct > 0). Verifies the partition loop does not mix their counts.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [
            { id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 },
            { id: 's2', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 2 },
          ],
        })
      if (table === 'easa_topics') return buildChain({ data: [] })
      return buildChain({ data: null })
    })
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: null, total: 10, correct: 7 }, // active
        { subject_id: 's2', topic_id: null, total: 0, correct: 2 }, // orphan
      ],
      error: null,
    })

    const result = await getProgressData()
    expect(result).toHaveLength(2)

    const agk = result.find((s) => s.id === 's1')!
    expect(agk.totalQuestions).toBe(10)
    expect(agk.answeredCorrectly).toBe(7)
    expect(agk.masteryPercentage).toBe(70)

    const met = result.find((s) => s.id === 's2')!
    expect(met.totalQuestions).toBe(0)
    expect(met.answeredCorrectly).toBe(2)
    expect(met.masteryPercentage).toBe(0)
  })
})
