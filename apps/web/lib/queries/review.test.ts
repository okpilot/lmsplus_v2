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

import { getDueCards, getNewQuestionIds } from './review'

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

function mockFromSequence(...responses: unknown[]) {
  let call = 0
  mockFrom.mockImplementation(() => buildChain(responses[call++] ?? { data: null }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---- getDueCards ----------------------------------------------------------

describe('getDueCards', () => {
  it('throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getDueCards()).rejects.toThrow('Not authenticated')
  })

  it('throws when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'token expired' },
    })
    await expect(getDueCards()).rejects.toThrow('Auth error: token expired')
  })

  it('returns mapped DueCard objects for authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence({
      data: [
        { question_id: 'q1', due: '2026-03-10T00:00:00Z', state: 'review' },
        { question_id: 'q2', due: '2026-03-09T00:00:00Z', state: 'learning' },
      ],
    })

    const result = await getDueCards()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      questionId: 'q1',
      due: '2026-03-10T00:00:00Z',
      state: 'review',
    })
    // Test setup guarantees two due cards in result
    expect(result[1]!.questionId).toBe('q2')
  })

  it('returns empty array when no due cards exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence({ data: [] })
    const result = await getDueCards()
    expect(result).toEqual([])
  })

  it('returns empty array when data is null', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence({ data: null })
    const result = await getDueCards()
    expect(result).toEqual([])
  })

  it('respects the limit parameter', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence({ data: [] })
    // Simply verify the function accepts a custom limit without error
    await expect(getDueCards({ limit: 5 })).resolves.toEqual([])
  })

  it('throws when the fsrs_cards query returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence({ data: null, error: { message: 'permission denied' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getDueCards()).rejects.toThrow('Failed to load due cards')
    consoleSpy.mockRestore()
  })

  it('returns empty array when subject filter matches no cards', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence(
      {
        data: [{ question_id: 'q1', due: '2026-03-10T00:00:00Z', state: 'review' }],
      },
      { data: [] }, // no questions match the subject
    )

    const result = await getDueCards({ subjectIds: ['subj-99'] })
    expect(result).toEqual([])
  })

  it('throws when the subject filter query returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence(
      {
        data: [{ question_id: 'q1', due: '2026-03-10T00:00:00Z', state: 'review' }],
      },
      { data: null, error: { message: 'permission denied for table questions' } },
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getDueCards({ subjectIds: ['subj-1'] })).rejects.toThrow(
      'Failed to load due cards',
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getDueCards] Subject filter query failed:',
      'permission denied for table questions',
    )
    consoleSpy.mockRestore()
  })

  it('filters cards by subject when subjectIds are provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence(
      {
        data: [
          { question_id: 'q1', due: '2026-03-10T00:00:00Z', state: 'review' },
          { question_id: 'q2', due: '2026-03-09T00:00:00Z', state: 'learning' },
        ],
      },
      { data: [{ id: 'q1' }] },
    )

    const result = await getDueCards({ subjectIds: ['subj-1'] })
    expect(result).toHaveLength(1)
    expect(result[0]!.questionId).toBe('q1')
  })
})

// ---- getNewQuestionIds ---------------------------------------------------

describe('getNewQuestionIds', () => {
  it('throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getNewQuestionIds()).rejects.toThrow('Not authenticated')
  })

  it('throws when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'token expired' },
    })
    await expect(getNewQuestionIds()).rejects.toThrow('Auth error: token expired')
  })

  it('returns question IDs not already seen by the student', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence(
      { data: [{ question_id: 'q1' }, { question_id: 'q2' }] }, // existing cards
      { data: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }] }, // all active
    )

    const result = await getNewQuestionIds(20)
    expect(result).toEqual(['q3', 'q4'])
  })

  it('returns all active questions when student has no existing cards', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence(
      { data: [] }, // no existing cards
      { data: [{ id: 'q1' }, { id: 'q2' }] },
    )

    const result = await getNewQuestionIds(20)
    expect(result).toEqual(['q1', 'q2'])
  })

  it('returns empty array when all active questions have been seen', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence(
      { data: [{ question_id: 'q1' }, { question_id: 'q2' }] },
      { data: [{ id: 'q1' }, { id: 'q2' }] },
    )

    const result = await getNewQuestionIds(20)
    expect(result).toEqual([])
  })

  it('limits result to the requested count', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFromSequence(
      { data: [] }, // no existing cards
      {
        data: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }, { id: 'q5' }],
      },
    )

    const result = await getNewQuestionIds(3)
    expect(result).toHaveLength(3)
  })
})
