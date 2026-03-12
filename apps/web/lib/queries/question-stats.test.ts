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
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses') {
        return buildChain({
          data: [
            { is_correct: true, created_at: '2026-03-11T00:00:00Z' },
            { is_correct: true, created_at: '2026-03-10T00:00:00Z' },
            { is_correct: false, created_at: '2026-03-09T00:00:00Z' },
          ],
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
    expect(result.timesSeen).toBe(3)
    expect(result.correctCount).toBe(2)
    expect(result.incorrectCount).toBe(1)
    expect(result.lastAnswered).toBe('2026-03-11T00:00:00Z')
    expect(result.fsrsState).toBe('Review')
  })

  it('returns null FSRS fields when no FSRS card exists for the question', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: null, error: null }))

    const result = await getQuestionStats('q-1')
    expect(result.fsrsState).toBeNull()
    expect(result.fsrsStability).toBeNull()
    expect(result.fsrsDifficulty).toBeNull()
    expect(result.fsrsInterval).toBeNull()
  })

  it('throws when the response query returns an error', async () => {
    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses') {
        callCount++
        if (callCount === 1) {
          return buildChain({ data: null, error: { message: 'DB failure' } })
        }
      }
      return buildChain({ data: null, error: null })
    })

    await expect(getQuestionStats('q-1')).rejects.toThrow('Failed to fetch responses: DB failure')
  })

  it('throws when the FSRS card query returns an error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'fsrs_cards') {
        return buildChain({ data: null, error: { message: 'fsrs failure' } })
      }
      return buildChain({ data: null, error: null })
    })

    await expect(getQuestionStats('q-1')).rejects.toThrow('Failed to fetch FSRS card: fsrs failure')
  })

  it('throws when the last response query returns an error', async () => {
    const studentResponsesCalls: number[] = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses') {
        const callIndex = studentResponsesCalls.push(1)
        if (callIndex === 2) {
          return buildChain({ data: null, error: { message: 'last response failure' } })
        }
        return buildChain({ data: [], error: null })
      }
      return buildChain({ data: null, error: null })
    })

    await expect(getQuestionStats('q-1')).rejects.toThrow(
      'Failed to fetch last response: last response failure',
    )
  })

  it('returns zero counts when no responses exist', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: null, error: null }))

    const result = await getQuestionStats('q-1')
    expect(result.timesSeen).toBe(0)
    expect(result.correctCount).toBe(0)
    expect(result.incorrectCount).toBe(0)
  })
})
