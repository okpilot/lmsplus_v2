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

  it('returns only questions with last_was_correct=false when filter is incorrect', async () => {
    // First call: questions pool
    // Second call: fsrs_cards with last_was_correct=false scoped to those question IDs
    mockFromSequence(
      { data: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] },
      { data: [{ question_id: 'q2' }] }, // only q2 was answered incorrectly
    )

    const result = await getRandomQuestionIds({
      subjectId: 's1',
      count: 10,
      filters: ['incorrect'],
      userId: 'u1',
    })
    expect(result).toEqual(['q2'])
  })

  it('returns empty array when no incorrect questions exist for the filter', async () => {
    mockFromSequence(
      { data: [{ id: 'q1' }, { id: 'q2' }] },
      { data: [] }, // no incorrect cards
    )

    const result = await getRandomQuestionIds({
      subjectId: 's1',
      count: 10,
      filters: ['incorrect'],
      userId: 'u1',
    })
    expect(result).toEqual([])
  })

  it('skips incorrect filter and returns all questions when userId is not provided', async () => {
    mockFromSequence({ data: [{ id: 'q1' }, { id: 'q2' }] })

    const result = await getRandomQuestionIds({
      subjectId: 's1',
      count: 10,
      filters: ['incorrect'],
      // no userId
    })
    // Without userId, filter is bypassed — all questions returned
    expect(result).toHaveLength(2)
  })

  it('returns empty array without querying fsrs_cards when question pool is empty and filter is incorrect', async () => {
    // Only one from() call should happen (questions pool returns empty).
    // The early-return guard in filterIncorrect must prevent a second fsrs_cards query.
    mockFromSequence({ data: [] })

    const result = await getRandomQuestionIds({
      subjectId: 's1',
      count: 10,
      filters: ['incorrect'],
      userId: 'u1',
    })

    expect(result).toEqual([])
    // Only one DB call was made (the questions pool) — fsrs_cards was never queried
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })
})

describe('getSubtopicsForTopic', () => {
  it('returns subtopics with question counts for the given topic', async () => {
    mockFromSequence(
      {
        data: [
          { id: 'st1', code: '050-01-01', name: 'Lift', sort_order: 1 },
          { id: 'st2', code: '050-01-02', name: 'Drag', sort_order: 2 },
        ],
      },
      { data: [{ subtopic_id: 'st1' }, { subtopic_id: 'st1' }, { subtopic_id: 'st2' }] },
    )

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
    mockFromSequence(
      { data: [{ id: 'st1', code: '050-01-01', name: 'Lift', sort_order: 1 }] },
      { data: [] }, // no active questions for any subtopic
    )

    const result = await getSubtopicsForTopic('t1')
    expect(result).toHaveLength(0)
  })
})

describe('getTopicsWithSubtopics', () => {
  it('returns topics with their subtopics and question counts', async () => {
    // Call sequence: topics → [subtopics, question topic_ids, question subtopic_ids]
    mockFromSequence(
      { data: [{ id: 't1', code: '050-01', name: 'Aerodynamics', sort_order: 1 }] },
      {
        data: [{ id: 'st1', code: '050-01-01', name: 'Lift', sort_order: 1, topic_id: 't1' }],
      },
      { data: [{ topic_id: 't1' }, { topic_id: 't1' }] },
      { data: [{ subtopic_id: 'st1' }] },
    )

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
      { data: [] }, // no subtopics
      { data: [] }, // no question topic refs
      { data: [] }, // no question subtopic refs
    )

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
      { data: [{ topic_id: 't1' }] },
      { data: [{ subtopic_id: 'st1' }] }, // st2 has no questions
    )

    const result = await getTopicsWithSubtopics('s1')
    expect(result).toHaveLength(1)
    expect(result[0]!.subtopics).toHaveLength(1)
    expect(result[0]!.subtopics[0]!.id).toBe('st1')
  })
})

describe('getRandomQuestionIds — empty topic/subtopic arrays short-circuit', () => {
  it('returns empty array immediately when topicIds is an empty array', async () => {
    const result = await getRandomQuestionIds({
      subjectId: 's1',
      topicIds: [],
      count: 10,
    })
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns empty array immediately when subtopicIds is an empty array', async () => {
    const result = await getRandomQuestionIds({
      subjectId: 's1',
      subtopicIds: [],
      count: 10,
    })
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('getRandomQuestionIds — OR logic for topicIds + subtopicIds', () => {
  it('uses OR filter when both topicIds and subtopicIds are provided', async () => {
    // The chain mock must capture the `or()` call — use a spy-based buildChain
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
      then: vi.fn((resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: [{ id: 'q1' }] })),
      ),
    }
    mockFrom.mockReturnValue(chain)

    const result = await getRandomQuestionIds({
      subjectId: 's1',
      topicIds: ['t1'],
      subtopicIds: ['st1'],
      count: 10,
    })

    expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('topic_id.in.'))
    expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('subtopic_id.in.'))
    expect(result).toContain('q1')
  })
})

describe('getRandomQuestionIds — flagged filter', () => {
  it('returns only flagged questions for the student', async () => {
    mockFromSequence(
      { data: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] },
      { data: [{ question_id: 'q2' }] }, // only q2 is flagged
    )

    const result = await getRandomQuestionIds({
      subjectId: 's1',
      count: 10,
      filters: ['flagged'],
      userId: 'u1',
    })
    expect(result).toEqual(['q2'])
  })

  it('returns empty array when no flagged questions exist', async () => {
    mockFromSequence(
      { data: [{ id: 'q1' }, { id: 'q2' }] },
      { data: [] }, // no flagged questions
    )

    const result = await getRandomQuestionIds({
      subjectId: 's1',
      count: 10,
      filters: ['flagged'],
      userId: 'u1',
    })
    expect(result).toEqual([])
  })
})

describe('getRandomQuestionIds — filter error paths', () => {
  it('returns empty array when filterUnseen query errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFromSequence(
      { data: [{ id: 'q1' }] },
      { data: null, error: { message: 'student_responses error' } },
    )

    const result = await getRandomQuestionIds({
      subjectId: 's1',
      count: 10,
      filters: ['unseen'],
      userId: 'u1',
    })

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[filterUnseen] student_responses query error:',
      'student_responses error',
    )
    consoleSpy.mockRestore()
  })

  it('returns empty array when filterIncorrect query errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFromSequence(
      { data: [{ id: 'q1' }] },
      { data: null, error: { message: 'fsrs_cards error' } },
    )

    const result = await getRandomQuestionIds({
      subjectId: 's1',
      count: 10,
      filters: ['incorrect'],
      userId: 'u1',
    })

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[filterIncorrect] fsrs_cards query error:',
      'fsrs_cards error',
    )
    consoleSpy.mockRestore()
  })
})
