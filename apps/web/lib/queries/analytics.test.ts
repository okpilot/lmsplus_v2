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
    mockRpc.mockResolvedValue({ data: [], error: null })
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

  it('throws when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Session expired' },
    })
    await expect(getDailyActivity()).rejects.toThrow('Auth error: Session expired')
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getDailyActivity()).rejects.toThrow('Not authenticated')
  })

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })
    await expect(getDailyActivity()).rejects.toThrow('Failed to fetch daily activity')
  })

  it('clamps days above 365 to 365', async () => {
    await getDailyActivity(500)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_daily_activity', {
      p_student_id: 'user-1',
      p_days: 365,
    })
  })

  it('clamps days below 1 to 1', async () => {
    await getDailyActivity(0)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_daily_activity', {
      p_student_id: 'user-1',
      p_days: 1,
    })
  })

  it('truncates fractional days to the integer part', async () => {
    await getDailyActivity(14.9)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_daily_activity', {
      p_student_id: 'user-1',
      p_days: 14,
    })
  })

  it('treats NaN days as the minimum (1)', async () => {
    await getDailyActivity(Number.NaN)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_daily_activity', {
      p_student_id: 'user-1',
      p_days: 1,
    })
  })

  it('treats positive Infinity days as the minimum (1) because non-finite values fall back to min', async () => {
    await getDailyActivity(Number.POSITIVE_INFINITY)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_daily_activity', {
      p_student_id: 'user-1',
      p_days: 1,
    })
  })

  it('treats negative Infinity days as the minimum (1)', async () => {
    await getDailyActivity(Number.NEGATIVE_INFINITY)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_daily_activity', {
      p_student_id: 'user-1',
      p_days: 1,
    })
  })
})

describe('getSubjectScores', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
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

  it('clamps limit above 100 to 100', async () => {
    await getSubjectScores(200)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_subject_scores', {
      p_student_id: 'user-1',
      p_limit: 100,
    })
  })

  it('clamps limit below 1 to 1', async () => {
    await getSubjectScores(0)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_subject_scores', {
      p_student_id: 'user-1',
      p_limit: 1,
    })
  })

  it('truncates fractional limit to the integer part', async () => {
    await getSubjectScores(3.7)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_subject_scores', {
      p_student_id: 'user-1',
      p_limit: 3,
    })
  })

  it('treats NaN limit as the minimum (1)', async () => {
    await getSubjectScores(Number.NaN)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_subject_scores', {
      p_student_id: 'user-1',
      p_limit: 1,
    })
  })

  it('treats Infinity limit as the minimum (1) because non-finite values fall back to min', async () => {
    await getSubjectScores(Number.POSITIVE_INFINITY)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_subject_scores', {
      p_student_id: 'user-1',
      p_limit: 1,
    })
  })

  it('throws when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    await expect(getSubjectScores()).rejects.toThrow('Auth error: JWT expired')
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getSubjectScores()).rejects.toThrow('Not authenticated')
  })

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    await expect(getSubjectScores()).rejects.toThrow('Failed to fetch subject scores')
  })
})
