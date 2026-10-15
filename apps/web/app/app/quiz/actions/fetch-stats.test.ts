import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetQuestionStats, mockGetSessionUser } = vi.hoisted(() => ({
  mockGetQuestionStats: vi.fn(),
  mockGetSessionUser: vi.fn(),
}))

vi.mock('@/lib/queries/question-stats', () => ({
  getQuestionStats: mockGetQuestionStats,
}))

vi.mock('@/lib/auth/get-session-user', () => ({ getSessionUser: mockGetSessionUser }))

import { fetchQuestionStats } from './fetch-stats'

describe('fetchQuestionStats', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: null })
  })

  it('returns stats for a valid question id', async () => {
    const stats = {
      timesSeen: 5,
      correctCount: 3,
      incorrectCount: 2,
      lastAnswered: '2026-03-11T00:00:00Z',
    }
    mockGetQuestionStats.mockResolvedValue(stats)

    const result = await fetchQuestionStats('00000000-0000-4000-a000-000000000001')

    expect(mockGetQuestionStats).toHaveBeenCalledWith('00000000-0000-4000-a000-000000000001')
    expect(result).toEqual(stats)
  })

  it('rejects when the stats query fails', async () => {
    mockGetQuestionStats.mockRejectedValue(new Error('DB error'))

    await expect(fetchQuestionStats('00000000-0000-4000-a000-000000000001')).rejects.toThrow(
      'DB error',
    )
  })

  it('rejects a non-UUID question id', async () => {
    await expect(fetchQuestionStats('not-a-uuid')).rejects.toThrow('Invalid input')
  })

  it('rejects an empty question id', async () => {
    await expect(fetchQuestionStats('')).rejects.toThrow('Invalid input')
  })

  it('short-circuits before querying when the id is invalid', async () => {
    await fetchQuestionStats('not-a-uuid').catch(() => undefined)
    expect(mockGetQuestionStats).not.toHaveBeenCalled()
  })

  it('throws when user is not authenticated', async () => {
    mockGetSessionUser.mockResolvedValue(null)

    await expect(fetchQuestionStats('00000000-0000-4000-a000-000000000001')).rejects.toThrow(
      'Not authenticated',
    )
    expect(mockGetQuestionStats).not.toHaveBeenCalled()
  })
})
