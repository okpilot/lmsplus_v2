import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { getQuestionStats } from './question-stats'

describe('getQuestionStats', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getQuestionStats('q-1')).rejects.toThrow('Not authenticated')
  })

  it('throws when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid JWT' },
    })
    await expect(getQuestionStats('q-1')).rejects.toThrow('Auth error: invalid JWT')
  })

  it('returns stats with counts when data is available', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses') {
        return buildChain({
          count: 5,
          data: [{ created_at: '2026-03-11T00:00:00Z' }],
          error: null,
        })
      }
      if (table === 'fsrs_cards') {
        return buildChain({
          data: { state: 'Review', stability: 10.5, difficulty: 3.2, scheduled_days: 7 },
          error: null,
        })
      }
      return buildChain({ data: null, error: null })
    })

    const result = await getQuestionStats('q-1')
    expect(result.timesSeen).toBe(5)
    expect(result.correctCount).toBe(5)
    expect(result.lastAnswered).toBe('2026-03-11T00:00:00Z')
    expect(result.fsrsState).toBe('Review')
  })

  it('returns null FSRS fields when no FSRS card exists for the question', async () => {
    mockFrom.mockImplementation(() => buildChain({ count: 3, data: null, error: null }))

    const result = await getQuestionStats('q-1')
    expect(result.fsrsState).toBeNull()
    expect(result.fsrsStability).toBeNull()
    expect(result.fsrsDifficulty).toBeNull()
    expect(result.fsrsInterval).toBeNull()
  })

  it('throws when the total response count query returns an error', async () => {
    let studentResponsesCall = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses') {
        studentResponsesCall++
        if (studentResponsesCall === 1) {
          return buildChain({ count: null, error: { message: 'DB failure' } })
        }
      }
      return buildChain({ count: 5, data: null, error: null })
    })

    await expect(getQuestionStats('q-1')).rejects.toThrow('Failed to count responses: DB failure')
  })

  it('throws when the correct response count query returns an error', async () => {
    let studentResponsesCall = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses') {
        studentResponsesCall++
        if (studentResponsesCall === 2) {
          return buildChain({ count: null, error: { message: 'correct count failure' } })
        }
      }
      return buildChain({ count: 2, data: null, error: null })
    })

    await expect(getQuestionStats('q-1')).rejects.toThrow(
      'Failed to count correct responses: correct count failure',
    )
  })

  it('throws when the FSRS card query returns an error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'fsrs_cards') {
        return buildChain({ data: null, error: { message: 'fsrs failure' } })
      }
      return buildChain({ count: 2, data: null, error: null })
    })

    await expect(getQuestionStats('q-1')).rejects.toThrow('Failed to fetch FSRS card: fsrs failure')
  })

  it('throws when the last response query returns an error', async () => {
    let studentResponsesCall = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses') {
        studentResponsesCall++
        // Calls 1-2 are the parallel COUNTs inside getResponseCounts,
        // call 3 is getLastResponse (concurrent via outer Promise.all)
        if (studentResponsesCall === 3) {
          return buildChain({ data: null, error: { message: 'last response failure' } })
        }
        return buildChain({ count: 1, data: null, error: null })
      }
      return buildChain({ data: null, error: null })
    })

    await expect(getQuestionStats('q-1')).rejects.toThrow(
      'Failed to fetch last response: last response failure',
    )
  })

  it('returns zero counts when no responses exist', async () => {
    mockFrom.mockImplementation(() => buildChain({ count: 0, data: null, error: null }))

    const result = await getQuestionStats('q-1')
    expect(result.timesSeen).toBe(0)
    expect(result.correctCount).toBe(0)
    expect(result.incorrectCount).toBe(0)
  })
})
