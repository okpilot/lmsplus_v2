import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

const { mockGetQuestionStats, mockGetUser } = vi.hoisted(() => ({
  mockGetQuestionStats: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@/lib/queries/question-stats', () => ({
  getQuestionStats: mockGetQuestionStats,
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

import { fetchQuestionStats } from './fetch-stats'

describe('fetchQuestionStats', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns stats for a valid question id', async () => {
    const stats = {
      timesSeen: 5,
      correctCount: 3,
      incorrectCount: 2,
      lastAnswered: '2026-03-11T00:00:00Z',
    }
    mockGetQuestionStats.mockResolvedValue(stats)

    const result = await fetchQuestionStats('00000000-0000-0000-0000-000000000001')

    expect(mockGetQuestionStats).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001')
    expect(result).toEqual(stats)
  })

  it('rejects when the stats query fails', async () => {
    mockGetQuestionStats.mockRejectedValue(new Error('DB error'))

    await expect(fetchQuestionStats('00000000-0000-0000-0000-000000000001')).rejects.toThrow(
      'DB error',
    )
  })

  it('rejects a non-UUID question id', async () => {
    await expect(fetchQuestionStats('not-a-uuid')).rejects.toThrow(ZodError)
  })

  it('rejects an empty question id', async () => {
    await expect(fetchQuestionStats('')).rejects.toThrow(ZodError)
  })

  it('short-circuits before querying when the id is invalid', async () => {
    await fetchQuestionStats('not-a-uuid').catch(() => undefined)
    expect(mockGetQuestionStats).not.toHaveBeenCalled()
  })

  it('throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    await expect(fetchQuestionStats('00000000-0000-0000-0000-000000000001')).rejects.toThrow(
      'Not authenticated',
    )
    expect(mockGetQuestionStats).not.toHaveBeenCalled()
  })

  it('throws when authentication fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })

    await expect(fetchQuestionStats('00000000-0000-0000-0000-000000000001')).rejects.toThrow(
      'Auth error',
    )
    expect(mockGetQuestionStats).not.toHaveBeenCalled()
  })
})
