import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom, mockGetTopicsForSubject, mockGetSubtopicsForTopic } = vi.hoisted(
  () => ({
    mockGetUser: vi.fn(),
    mockFrom: vi.fn(),
    mockGetTopicsForSubject: vi.fn(),
    mockGetSubtopicsForTopic: vi.fn(),
  }),
)

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

const { mockGetTopicsWithSubtopics } = vi.hoisted(() => ({
  mockGetTopicsWithSubtopics: vi.fn(),
}))

const mockRequireAuthUser = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-auth-user', () => ({
  requireAuthUser: mockRequireAuthUser,
}))

vi.mock('@/lib/queries/quiz', () => ({
  getTopicsForSubject: (...args: unknown[]) => mockGetTopicsForSubject(...args),
  getSubtopicsForTopic: (...args: unknown[]) => mockGetSubtopicsForTopic(...args),
  getTopicsWithSubtopics: (...args: unknown[]) => mockGetTopicsWithSubtopics(...args),
}))

// ---- Subject under test ---------------------------------------------------

import {
  fetchSubtopicsForTopic,
  fetchTopicsForSubject,
  fetchTopicsWithSubtopics,
  getFilteredCount,
} from './lookup'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const TOPIC_ID = '00000000-0000-4000-a000-000000000020'
const SUBTOPIC_ID = '00000000-0000-4000-a000-000000000030'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'
const Q3_ID = '00000000-0000-4000-a000-000000000033'

const TOPIC_OPTIONS = [{ id: TOPIC_ID, name: 'Aerodynamics', code: 'AERO' }]

const SUBTOPIC_OPTIONS = [{ id: SUBTOPIC_ID, name: 'Lift', code: 'LIFT' }]

// ---- Helpers --------------------------------------------------------------

function setupAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
}

function setupUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

/**
 * Build a chainable Supabase from() mock.
 * The chain is thenable — awaiting it resolves to `{ data, error }`.
 */
function buildQueryChain(terminalData: unknown[], terminalError: unknown = null) {
  const terminal = { data: terminalData, error: terminalError }
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable — mock must implement .then() to be awaitable
    then: vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(terminal))),
  }
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAuthUser.mockResolvedValue({ id: USER_ID })
})

// ---- fetchTopicsForSubject ------------------------------------------------

describe('fetchTopicsForSubject', () => {
  it('delegates to getTopicsForSubject with the provided subjectId', async () => {
    mockGetTopicsForSubject.mockResolvedValue(TOPIC_OPTIONS)
    const result = await fetchTopicsForSubject(SUBJECT_ID)
    expect(mockGetTopicsForSubject).toHaveBeenCalledWith(SUBJECT_ID)
    expect(result).toEqual(TOPIC_OPTIONS)
  })

  it('returns an empty array when the underlying query returns none', async () => {
    mockGetTopicsForSubject.mockResolvedValue([])
    const result = await fetchTopicsForSubject(SUBJECT_ID)
    expect(result).toEqual([])
  })

  it('returns empty array and logs when the id is not a valid UUID', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchTopicsForSubject('not-a-uuid')
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchTopicsForSubject] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty array and logs when the id is null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchTopicsForSubject(null)
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchTopicsForSubject] Invalid input')
    consoleSpy.mockRestore()
  })

  it('redirects to login when unauthenticated', async () => {
    mockRequireAuthUser.mockRejectedValue(new Error('NEXT_REDIRECT:/auth/login'))
    await expect(fetchTopicsForSubject(SUBJECT_ID)).rejects.toThrow('NEXT_REDIRECT')
  })
})

// ---- fetchSubtopicsForTopic -----------------------------------------------

describe('fetchSubtopicsForTopic', () => {
  it('delegates to getSubtopicsForTopic with the provided topicId', async () => {
    mockGetSubtopicsForTopic.mockResolvedValue(SUBTOPIC_OPTIONS)
    const result = await fetchSubtopicsForTopic(TOPIC_ID)
    expect(mockGetSubtopicsForTopic).toHaveBeenCalledWith(TOPIC_ID)
    expect(result).toEqual(SUBTOPIC_OPTIONS)
  })

  it('returns an empty array when the underlying query returns none', async () => {
    mockGetSubtopicsForTopic.mockResolvedValue([])
    const result = await fetchSubtopicsForTopic(TOPIC_ID)
    expect(result).toEqual([])
  })

  it('returns empty array and logs when the id is not a valid UUID', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchSubtopicsForTopic('not-a-uuid')
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchSubtopicsForTopic] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty array and logs when the id is null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchSubtopicsForTopic(null)
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchSubtopicsForTopic] Invalid input')
    consoleSpy.mockRestore()
  })

  it('redirects to login when unauthenticated', async () => {
    mockRequireAuthUser.mockRejectedValue(new Error('NEXT_REDIRECT:/auth/login'))
    await expect(fetchSubtopicsForTopic(TOPIC_ID)).rejects.toThrow('NEXT_REDIRECT')
  })
})

// ---- getFilteredCount — auth & validation ---------------------------------

describe('getFilteredCount — auth and validation', () => {
  it('returns auth error when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })
    expect(result).toMatchObject({ count: 0, error: 'auth' })
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

// ---- getFilteredCount — filters: ['all'] ---------------------------------

describe("getFilteredCount — filters: ['all']", () => {
  it('returns the total question count without further filtering', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }, { id: Q3_ID }])
    mockFrom.mockReturnValue(chain)

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(result).toMatchObject({ count: 3 })
  })

  it('returns count 0 when no questions match the subject', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([])
    mockFrom.mockReturnValue(chain)

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(result).toMatchObject({ count: 0 })
  })

  it('filters by topicIds when provided', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([{ id: Q1_ID }])
    mockFrom.mockReturnValue(chain)

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: [TOPIC_ID],
      filters: ['all'],
    })

    expect(result).toMatchObject({ count: 1 })
    // in() called for topicIds
    expect((chain.in as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('filters by subtopicIds when provided', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([{ id: Q1_ID }])
    mockFrom.mockReturnValue(chain)

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: [TOPIC_ID],
      subtopicIds: [SUBTOPIC_ID],
      filters: ['all'],
    })

    expect(result).toMatchObject({ count: 1 })
    expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('topic_id.in.'))
  })
})

// ---- getFilteredCount — filters: ['unseen'] ------------------------------

describe("getFilteredCount — filters: ['unseen']", () => {
  it('returns count of questions not yet answered by the student', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }, { id: Q3_ID }])
      }
      // student_responses
      return buildQueryChain([{ question_id: Q1_ID }])
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['unseen'] })

    expect(result).toMatchObject({ count: 2 })
  })

  it('returns all questions when the student has no answered questions', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }])
      }
      return buildQueryChain([])
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['unseen'] })

    expect(result).toMatchObject({ count: 2 })
  })

  it('returns 0 when student has answered all questions', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }])
      }
      return buildQueryChain([{ question_id: Q1_ID }, { question_id: Q2_ID }])
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['unseen'] })

    expect(result).toMatchObject({ count: 0 })
  })
})

// ---- getFilteredCount — filters: ['incorrect'] ---------------------------

describe("getFilteredCount — filters: ['incorrect']", () => {
  it('returns count of questions the student last answered incorrectly', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }, { id: Q3_ID }])
      }
      // fsrs_cards with last_was_correct = false
      return buildQueryChain([{ question_id: Q1_ID }, { question_id: Q3_ID }])
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['incorrect'] })

    expect(result).toMatchObject({ count: 2 })
  })

  it('returns 0 when no incorrectly-answered cards exist for the student', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }])
      }
      return buildQueryChain([])
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['incorrect'] })

    expect(result).toMatchObject({ count: 0 })
  })

  it('only counts questions that are in the base subject set (intersection)', async () => {
    setupAuthenticatedUser()

    // Only Q1 is in the subject; Q2 is in fsrs_cards but not in this subject
    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }])
      }
      return buildQueryChain([{ question_id: Q1_ID }, { question_id: Q2_ID }])
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['incorrect'] })

    expect(result).toMatchObject({ count: 1 })
  })
})

// ---- getFilteredCount — questions query error ----------------------------

describe('getFilteredCount — questions query error', () => {
  it('returns count 0 when the questions query itself returns an error', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFrom.mockImplementation(() => buildQueryChain([], { message: 'questions DB error' }))

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['all'] })

    expect(result).toMatchObject({ count: 0 })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getFilteredCount] Questions query error:',
      'questions DB error',
    )
    consoleSpy.mockRestore()
  })

  it('returns count 0 for unseen filter when questions query errors', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFrom.mockImplementation(() => buildQueryChain([], { message: 'questions DB error' }))

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['unseen'] })

    expect(result).toMatchObject({ count: 0 })
    consoleSpy.mockRestore()
  })
})

// ---- getFilteredCount — filters: ['flagged'] --------------------------------

describe("getFilteredCount — filters: ['flagged']", () => {
  it('returns count of questions flagged by the student', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([
          { id: Q1_ID, topic_id: TOPIC_ID, subtopic_id: null },
          { id: Q2_ID, topic_id: TOPIC_ID, subtopic_id: SUBTOPIC_ID },
          { id: Q3_ID, topic_id: TOPIC_ID, subtopic_id: null },
        ])
      }
      // flagged_questions — only Q2 is flagged
      return buildQueryChain([{ question_id: Q2_ID }])
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['flagged'] })

    expect(result).toMatchObject({ count: 1 })
  })

  it('returns count 0 when student has no flagged questions', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID, topic_id: TOPIC_ID, subtopic_id: null }])
      }
      return buildQueryChain([])
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filters: ['flagged'] })

    expect(result).toMatchObject({ count: 0 })
  })

  it('returns count 0 when topicIds is empty (short-circuit before DB query)', async () => {
    setupAuthenticatedUser()
    // Must provide a chain so the query builder can chain .from().select()...
    // The empty topicIds guard fires before the chain is awaited.
    mockFrom.mockReturnValue(buildQueryChain([]))

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: [],
      filters: ['flagged'],
    })

    expect(result).toMatchObject({ count: 0 })
  })

  it('returns count 0 when both topicIds and subtopicIds are empty', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildQueryChain([]))

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: [],
      subtopicIds: [],
      filters: ['flagged'],
    })

    expect(result).toMatchObject({ count: 0 })
  })
})

// ---- getFilteredCount — bail logic (AND semantics) -----------------------

describe('getFilteredCount — bail logic (both arrays must be empty to short-circuit)', () => {
  it('does NOT bail when topicIds is empty but subtopicIds is undefined', async () => {
    setupAuthenticatedUser()
    // subtopicIds undefined means "no subtopic filter" — subject-level fallback applies
    mockFrom.mockReturnValue(buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }]))

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: [],
      subtopicIds: undefined,
      filters: ['all'],
    })

    // Query proceeds; result depends on what the DB returns, not the bail guard
    expect(result).toMatchObject({ count: 2 })
  })

  it('does NOT bail when subtopicIds is empty but topicIds is undefined', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildQueryChain([{ id: Q1_ID }]))

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: undefined,
      subtopicIds: [],
      filters: ['all'],
    })

    expect(result).toMatchObject({ count: 1 })
  })

  it('bails immediately when both topicIds and subtopicIds are empty arrays', async () => {
    setupAuthenticatedUser()
    // mockFrom should never be called if bail fires before the query
    mockFrom.mockReturnValue(buildQueryChain([{ id: Q1_ID }]))

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicIds: [],
      subtopicIds: [],
      filters: ['all'],
    })

    expect(result).toMatchObject({ count: 0 })
  })
})

// ---- fetchTopicsWithSubtopics -----------------------------------------------

const TOPIC_WITH_SUBTOPICS = [
  {
    id: TOPIC_ID,
    code: 'AERO',
    name: 'Aerodynamics',
    questionCount: 5,
    subtopics: [{ id: SUBTOPIC_ID, code: 'LIFT', name: 'Lift', questionCount: 3 }],
  },
]

describe('fetchTopicsWithSubtopics', () => {
  it('delegates to getTopicsWithSubtopics with the provided subjectId', async () => {
    mockGetTopicsWithSubtopics.mockResolvedValue(TOPIC_WITH_SUBTOPICS)
    const result = await fetchTopicsWithSubtopics(SUBJECT_ID)
    expect(mockGetTopicsWithSubtopics).toHaveBeenCalledWith(SUBJECT_ID)
    expect(result).toEqual(TOPIC_WITH_SUBTOPICS)
  })

  it('returns an empty array when no topics exist for the subject', async () => {
    mockGetTopicsWithSubtopics.mockResolvedValue([])
    const result = await fetchTopicsWithSubtopics(SUBJECT_ID)
    expect(result).toEqual([])
  })

  it('returns empty array and logs when the id is not a valid UUID', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchTopicsWithSubtopics('not-a-uuid')
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchTopicsWithSubtopics] Invalid input')
    consoleSpy.mockRestore()
  })

  it('returns empty array and logs when the id is null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchTopicsWithSubtopics(null)
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[fetchTopicsWithSubtopics] Invalid input')
    consoleSpy.mockRestore()
  })

  it('redirects to login when unauthenticated', async () => {
    mockRequireAuthUser.mockRejectedValue(new Error('NEXT_REDIRECT:/auth/login'))
    await expect(fetchTopicsWithSubtopics(SUBJECT_ID)).rejects.toThrow('NEXT_REDIRECT')
  })
})
