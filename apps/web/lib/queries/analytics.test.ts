import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

import { getDailyActivity, getSubjectScores } from './analytics'

describe('getDailyActivity', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('returns mapped daily activity from RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ day: '2026-03-01', total: 10, correct: 7, incorrect: 3 }],
      error: null,
    })

    const result = await getDailyActivity(30)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_daily_activity', {
      p_student_id: 'user-1',
      p_days: 30,
    })
    expect(result).toEqual([{ day: '2026-03-01', total: 10, correct: 7, incorrect: 3 }])
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getDailyActivity()).rejects.toThrow('Not authenticated')
  })

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })
    await expect(getDailyActivity()).rejects.toThrow('Failed to fetch daily activity')
  })
})

describe('getSubjectScores', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('returns mapped subject scores from RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          subject_id: 's-1',
          subject_name: 'Navigation',
          subject_short: 'NAV',
          avg_score: 85.5,
          session_count: 3,
        },
      ],
      error: null,
    })

    const result = await getSubjectScores(5)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_subject_scores', {
      p_student_id: 'user-1',
      p_limit: 5,
    })
    expect(result).toEqual([
      {
        subjectId: 's-1',
        subjectName: 'Navigation',
        subjectShort: 'NAV',
        avgScore: 85.5,
        sessionCount: 3,
      },
    ])
  })
})
