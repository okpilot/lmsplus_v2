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

  it('returns stats with counts when data is available', async () => {
    mockFrom.mockImplementation(() =>
      buildChain({
        count: 5,
        data: [
          {
            created_at: '2026-03-11T00:00:00Z',
          },
        ],
      }),
    )

    const result = await getQuestionStats('q-1')
    expect(result.timesSeen).toBe(5)
    expect(result.correctCount).toBe(5)
    expect(result.lastAnswered).toBe('2026-03-11T00:00:00Z')
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
    // First from() call (student_responses total count) returns an error.
    // Subsequent calls succeed so the error is clearly from the first query.
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return buildChain({ count: null, error: { message: 'DB failure' } })
      }
      return buildChain({ count: 5, data: null, error: null })
    })

    await expect(getQuestionStats('q-1')).rejects.toThrow('Failed to count responses: DB failure')
  })

  it('throws when the correct response count query returns an error', async () => {
    // Promise.all launches getResponseCounts, getFsrsCard, getLastResponse concurrently.
    // from() call order: (1) student_responses/total, (2) fsrs_cards, (3) student_responses/last,
    //   then after (1) resolves: (4) student_responses/correct.
    // So the 3rd student_responses call (index 3) is the correct-count query.
    const studentResponsesCalls: number[] = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses') {
        const callIndex = studentResponsesCalls.push(1)
        if (callIndex === 3) {
          return buildChain({ count: null, error: { message: 'correct count failure' } })
        }
        return buildChain({ count: 2, data: null, error: null })
      }
      return buildChain({ data: null, error: null })
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
    // from() call order: (1) student_responses/total, (2) fsrs_cards, (3) student_responses/last,
    //   then (4) student_responses/correct.
    // The 2nd student_responses call (index 2) is the last-response query.
    const studentResponsesCalls: number[] = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses') {
        const callIndex = studentResponsesCalls.push(1)
        if (callIndex === 2) {
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
})
