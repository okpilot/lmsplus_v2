import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { getRandomQuestionIds, getSubjectsWithCounts, getTopicsForSubject } from './quiz'

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
})

describe('getSubjectsWithCounts', () => {
  it('returns subjects with question counts aggregated by subject_id', async () => {
    mockFromSequence(
      {
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
      },
      { data: [{ subject_id: 's1' }, { subject_id: 's1' }, { subject_id: 's2' }] },
    )

    const result = await getSubjectsWithCounts()
    expect(result).toHaveLength(2)
    expect(result.find((s) => s.id === 's1')?.questionCount).toBe(2)
    expect(result.find((s) => s.id === 's2')?.questionCount).toBe(1)
  })

  it('returns empty array when no subjects exist', async () => {
    mockFromSequence({ data: [] })
    const result = await getSubjectsWithCounts()
    expect(result).toEqual([])
  })

  it('filters out subjects with zero questions', async () => {
    mockFromSequence(
      {
        data: [
          { id: 's1', code: 'AGK', name: 'AGK', short: 'AGK', sort_order: 1 },
          { id: 's2', code: 'MET', name: 'MET', short: 'MET', sort_order: 2 },
        ],
      },
      { data: [{ subject_id: 's1' }] }, // s2 has no questions
    )

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
    mockFromSequence(
      {
        data: [
          { id: 't1', code: '050-01', name: 'Airframe', sort_order: 1 },
          { id: 't2', code: '050-02', name: 'Engines', sort_order: 2 },
        ],
      },
      { data: [{ topic_id: 't1' }, { topic_id: 't1' }, { topic_id: 't2' }] },
    )

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
    mockFromSequence(
      { data: [{ id: 't1', code: '050-01', name: 'Airframe', sort_order: 1 }] },
      { data: [] }, // no active questions for any topic
    )

    const result = await getTopicsForSubject('s1')
    expect(result).toHaveLength(0)
  })
})

describe('getRandomQuestionIds', () => {
  it('returns up to count shuffled question IDs', async () => {
    mockFromSequence({
      data: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }, { id: 'q5' }],
    })

    const result = await getRandomQuestionIds({ subjectId: 's1', count: 3 })
    expect(result).toHaveLength(3)
    // All returned IDs should be from the source pool
    for (const id of result) {
      expect(['q1', 'q2', 'q3', 'q4', 'q5']).toContain(id)
    }
  })

  it('returns all IDs when count exceeds available questions', async () => {
    mockFromSequence({ data: [{ id: 'q1' }, { id: 'q2' }] })
    const result = await getRandomQuestionIds({ subjectId: 's1', count: 10 })
    expect(result).toHaveLength(2)
  })

  it('returns empty array when no questions are available', async () => {
    mockFromSequence({ data: [] })
    const result = await getRandomQuestionIds({ subjectId: 's1', count: 5 })
    expect(result).toEqual([])
  })

  it('returns empty array when data is null', async () => {
    mockFromSequence({ data: null })
    const result = await getRandomQuestionIds({ subjectId: 's1', count: 5 })
    expect(result).toEqual([])
  })
})
