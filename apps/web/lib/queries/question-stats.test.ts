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

  it('throws when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid JWT' },
    })
    await expect(getQuestionStats('q-1')).rejects.toThrow('Auth error: invalid JWT')
  })

  it('returns distinct total and correct counts when responses exist', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          { is_correct: true, created_at: '2026-03-11T00:00:00Z' },
          { is_correct: false, created_at: '2026-03-10T00:00:00Z' },
          { is_correct: true, created_at: '2026-03-09T00:00:00Z' },
          { is_correct: true, created_at: '2026-03-08T00:00:00Z' },
          { is_correct: false, created_at: '2026-03-07T00:00:00Z' },
          { is_correct: true, created_at: '2026-03-06T00:00:00Z' },
          { is_correct: true, created_at: '2026-03-05T00:00:00Z' },
          { is_correct: false, created_at: '2026-03-04T00:00:00Z' },
        ],
        error: null,
      }),
    )

    const result = await getQuestionStats('q-1')
    expect(result.timesSeen).toBe(8)
    expect(result.correctCount).toBe(5)
    expect(result.incorrectCount).toBe(3)
    expect(result.lastAnswered).toBe('2026-03-11T00:00:00Z')
  })

  it('throws when the response query returns an error', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'DB failure' } }))

    await expect(getQuestionStats('q-1')).rejects.toThrow('Failed to fetch responses: DB failure')
  })

  it('returns zero counts and null lastAnswered when no responses exist', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getQuestionStats('q-1')
    expect(result.timesSeen).toBe(0)
    expect(result.correctCount).toBe(0)
    expect(result.incorrectCount).toBe(0)
    expect(result.lastAnswered).toBeNull()
  })

  it('uses the most recent created_at as lastAnswered (first row of desc-sorted results)', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          { is_correct: false, created_at: '2026-03-15T12:00:00Z' },
          { is_correct: true, created_at: '2026-03-14T08:00:00Z' },
        ],
        error: null,
      }),
    )

    const result = await getQuestionStats('q-1')
    expect(result.lastAnswered).toBe('2026-03-15T12:00:00Z')
  })
})
