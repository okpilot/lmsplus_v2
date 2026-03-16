import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

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

vi.mock('@/lib/queries/quiz', () => ({
  getTopicsForSubject: (...args: unknown[]) => mockGetTopicsForSubject(...args),
  getSubtopicsForTopic: (...args: unknown[]) => mockGetSubtopicsForTopic(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { fetchSubtopicsForTopic, fetchTopicsForSubject, getFilteredCount } from './lookup'

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
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable — mock must implement .then() to be awaitable
    then: vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(terminal))),
  }
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
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

  it('throws (Zod) when the id is not a valid UUID', async () => {
    await expect(fetchTopicsForSubject('not-a-uuid')).rejects.toThrow(ZodError)
  })

  it('throws (Zod) when the id is null', async () => {
    await expect(fetchTopicsForSubject(null)).rejects.toThrow(ZodError)
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

  it('throws (Zod) when the id is not a valid UUID', async () => {
    await expect(fetchSubtopicsForTopic('not-a-uuid')).rejects.toThrow(ZodError)
  })

  it('throws (Zod) when the id is null', async () => {
    await expect(fetchSubtopicsForTopic(null)).rejects.toThrow(ZodError)
  })
})

// ---- getFilteredCount — auth & validation ---------------------------------

describe('getFilteredCount — auth and validation', () => {
  it('returns count 0 when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'all' })
    expect(result).toEqual({ count: 0 })
  })

  it('returns count 0 when authentication fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'all' })
    expect(result).toEqual({ count: 0 })
  })

  it('throws (Zod) when subjectId is not a valid UUID', async () => {
    await expect(getFilteredCount({ subjectId: 'not-a-uuid', filter: 'all' })).rejects.toThrow(
      ZodError,
    )
  })

  it('throws (Zod) when filter is an unknown value', async () => {
    await expect(getFilteredCount({ subjectId: SUBJECT_ID, filter: 'random' })).rejects.toThrow(
      ZodError,
    )
  })

  it('throws (Zod) when topicId is present but not a UUID', async () => {
    await expect(
      getFilteredCount({ subjectId: SUBJECT_ID, topicId: 'bad-id', filter: 'all' }),
    ).rejects.toThrow(ZodError)
  })

  it('treats an empty string topicId as absent (OptionalUuid preprocessor)', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([{ id: Q1_ID }])
    mockFrom.mockReturnValue(chain)

    // Empty string '' must be coerced to undefined, not fail UUID validation.
    const result = await getFilteredCount({ subjectId: SUBJECT_ID, topicId: '', filter: 'all' })

    expect(result).toEqual({ count: 1 })
  })

  it('treats an empty string subtopicId as absent (OptionalUuid preprocessor)', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([{ id: Q1_ID }])
    mockFrom.mockReturnValue(chain)

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      subtopicId: '',
      filter: 'all',
    })

    expect(result).toEqual({ count: 1 })
  })
})

// ---- getFilteredCount — filter: all --------------------------------------

describe('getFilteredCount — filter: all', () => {
  it('returns the total question count without further filtering', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }, { id: Q3_ID }])
    mockFrom.mockReturnValue(chain)

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'all' })

    expect(result).toEqual({ count: 3 })
  })

  it('returns count 0 when no questions match the subject', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([])
    mockFrom.mockReturnValue(chain)

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'all' })

    expect(result).toEqual({ count: 0 })
  })

  it('filters by topicId when provided', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([{ id: Q1_ID }])
    mockFrom.mockReturnValue(chain)

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
      filter: 'all',
    })

    expect(result).toEqual({ count: 1 })
    // eq called at least twice: once for subject_id, once for topic_id
    expect((chain.eq as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('filters by subtopicId when provided', async () => {
    setupAuthenticatedUser()
    const chain = buildQueryChain([{ id: Q1_ID }])
    mockFrom.mockReturnValue(chain)

    const result = await getFilteredCount({
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
      subtopicId: SUBTOPIC_ID,
      filter: 'all',
    })

    expect(result).toEqual({ count: 1 })
    expect((chain.eq as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})

// ---- getFilteredCount — filter: unseen -----------------------------------

describe('getFilteredCount — filter: unseen', () => {
  it('returns count of questions not yet answered by the student', async () => {
    setupAuthenticatedUser()

    // First from('questions') call returns 3 questions
    // Second from('student_responses') call returns 1 answered question
    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }, { id: Q3_ID }])
      }
      // student_responses
      return buildQueryChain([{ question_id: Q1_ID }])
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'unseen' })

    expect(result).toEqual({ count: 2 })
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

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'unseen' })

    expect(result).toEqual({ count: 2 })
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

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'unseen' })

    expect(result).toEqual({ count: 0 })
  })

  it('treats a null student_responses result as zero answered questions', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }])
      }
      const nullChain = buildQueryChain([], null)
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable
      nullChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: null, error: null })),
      )
      return nullChain
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'unseen' })

    expect(result).toEqual({ count: 1 })
  })
})

// ---- getFilteredCount — filter: incorrect --------------------------------

describe('getFilteredCount — filter: incorrect', () => {
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

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'incorrect' })

    expect(result).toEqual({ count: 2 })
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

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'incorrect' })

    expect(result).toEqual({ count: 0 })
  })

  it('treats a null fsrs_cards result as zero incorrect questions', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }])
      }
      const nullChain = buildQueryChain([], null)
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable
      nullChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: null, error: null })),
      )
      return nullChain
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'incorrect' })

    expect(result).toEqual({ count: 0 })
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

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'incorrect' })

    expect(result).toEqual({ count: 1 })
  })

  it('returns 0 when the fsrs_cards query returns an error', async () => {
    setupAuthenticatedUser()

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }])
      }
      return buildQueryChain([], { message: 'fsrs_cards DB error' })
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'incorrect' })

    // error causes incorrectCards to be null/undefined → treated as empty set
    expect(result).toEqual({ count: 0 })
  })
})

// ---- getFilteredCount — questions query error ----------------------------

describe('getFilteredCount — questions query error', () => {
  it('returns count 0 when the questions query itself returns an error', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFrom.mockImplementation(() => buildQueryChain([], { message: 'questions DB error' }))

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'all' })

    expect(result).toEqual({ count: 0 })
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

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'unseen' })

    expect(result).toEqual({ count: 0 })
    consoleSpy.mockRestore()
  })
})

// ---- getFilteredCount — secondary query errors ---------------------------

describe('getFilteredCount — secondary query errors', () => {
  it('falls back to all questions as unseen when student_responses query errors', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        return buildQueryChain([{ id: Q1_ID }, { id: Q2_ID }])
      }
      return buildQueryChain([], { message: 'student_responses DB error' })
    })

    const result = await getFilteredCount({ subjectId: SUBJECT_ID, filter: 'unseen' })

    // answered set is empty because error data is treated as null → all questions are unseen
    expect(result).toEqual({ count: 2 })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getFilteredCount] student_responses query error:',
      'student_responses DB error',
    )
    consoleSpy.mockRestore()
  })
})
