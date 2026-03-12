import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetQuestionStats } = vi.hoisted(() => ({
  mockGetQuestionStats: vi.fn(),
}))

vi.mock('@/lib/queries/question-stats', () => ({
  getQuestionStats: mockGetQuestionStats,
}))

import { fetchQuestionStats } from './fetch-stats'

describe('fetchQuestionStats', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('delegates to getQuestionStats and returns its result', async () => {
    const stats = {
      timesSeen: 5,
      correctCount: 3,
      incorrectCount: 2,
      lastAnswered: '2026-03-11T00:00:00Z',
      fsrsState: 'Review',
      fsrsStability: 10.5,
      fsrsDifficulty: 3.2,
      fsrsInterval: 7,
    }
    mockGetQuestionStats.mockResolvedValue(stats)

    const result = await fetchQuestionStats('00000000-0000-0000-0000-000000000001')

    expect(mockGetQuestionStats).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001')
    expect(result).toEqual(stats)
  })

  it('propagates errors thrown by getQuestionStats', async () => {
    mockGetQuestionStats.mockRejectedValue(new Error('Not authenticated'))

    await expect(fetchQuestionStats('00000000-0000-0000-0000-000000000001')).rejects.toThrow(
      'Not authenticated',
    )
  })
})
