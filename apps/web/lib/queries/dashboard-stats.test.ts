import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ----------------------------------------------------

import {
  applyLastPracticed,
  computeExamReadiness,
  getQuestionsToday,
  getStreakData,
} from './dashboard-stats'

// ---- Helpers ---------------------------------------------------------------

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

// ---- Setup -----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
  mockRpc.mockResolvedValue({ data: [], error: null })
})

// ---- computeExamReadiness --------------------------------------------------

describe('computeExamReadiness', () => {
  it('returns zero counts for an empty subject list', () => {
    expect(computeExamReadiness([])).toEqual({
      readyCount: 0,
      totalCount: 0,
      projectedDate: null,
    })
  })

  it('counts subjects at exactly 90% mastery as ready', () => {
    const subjects = [{ masteryPercentage: 90 }, { masteryPercentage: 89 }]
    const result = computeExamReadiness(subjects)
    expect(result.readyCount).toBe(1)
    expect(result.totalCount).toBe(2)
  })

  it('counts subjects above 90% as ready', () => {
    const subjects = [{ masteryPercentage: 95 }, { masteryPercentage: 100 }]
    const result = computeExamReadiness(subjects)
    expect(result.readyCount).toBe(2)
    expect(result.totalCount).toBe(2)
  })

  it('returns zero ready count when all subjects are below 90%', () => {
    const subjects = [
      { masteryPercentage: 0 },
      { masteryPercentage: 45 },
      { masteryPercentage: 89 },
    ]
    const result = computeExamReadiness(subjects)
    expect(result.readyCount).toBe(0)
    expect(result.totalCount).toBe(3)
  })

  it('always returns null for projectedDate', () => {
    const result = computeExamReadiness([{ masteryPercentage: 50 }])
    expect(result.projectedDate).toBeNull()
  })
})

// ---- getQuestionsToday -----------------------------------------------------

describe('getQuestionsToday', () => {
  it('returns the count of responses submitted today', async () => {
    mockFrom.mockReturnValue(buildChain({ count: 7, data: null }))
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await getQuestionsToday(supabase, 'user-1')
    expect(result).toBe(7)
  })

  it('returns 0 when count is null', async () => {
    mockFrom.mockReturnValue(buildChain({ count: null, data: null }))
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await getQuestionsToday(supabase, 'user-1')
    expect(result).toBe(0)
  })

  it('throws when the questions-today count read errors instead of degrading to 0', async () => {
    mockFrom.mockReturnValue(buildChain({ count: null, error: { message: 'boom' } }))
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    await expect(getQuestionsToday(supabase, 'user-1')).rejects.toThrow(
      'Failed to fetch questions answered today: boom',
    )
  })
})

// ---- getStreakData ----------------------------------------------------------

describe('getStreakData', () => {
  it('surfaces the current and best streak from the streak RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ current_streak: 4, best_streak: 9 }],
      error: null,
    })
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await getStreakData(supabase)
    expect(result).toEqual({ currentStreak: 4, bestStreak: 9 })
  })

  it('coerces string-encoded streak counts into numbers', async () => {
    // PostgREST may serialize bigint columns as strings depending on the driver.
    mockRpc.mockResolvedValue({
      data: [{ current_streak: '3', best_streak: '7' }],
      error: null,
    })
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await getStreakData(supabase)
    expect(result).toEqual({ currentStreak: 3, bestStreak: 7 })
  })

  it('returns zero streaks when the RPC returns no rows', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await getStreakData(supabase)
    expect(result).toEqual({ currentStreak: 0, bestStreak: 0 })
  })

  it('returns zero streaks when the RPC returns null data without an error', async () => {
    // Array.isArray(null) → false → rows = [] → fallback to { current_streak: 0, best_streak: 0 }.
    mockRpc.mockResolvedValue({ data: null, error: null })
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await getStreakData(supabase)
    expect(result).toEqual({ currentStreak: 0, bestStreak: 0 })
  })

  it('throws a sanitized error when the streak RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    await expect(getStreakData(supabase)).rejects.toThrow('Failed to fetch streak: boom')
  })
})

// ---- applyLastPracticed ----------------------------------------------------

describe('applyLastPracticed', () => {
  it('returns the same list unchanged without calling the RPC when subjects is empty', async () => {
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await applyLastPracticed(supabase, [])
    expect(result).toEqual([])
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('assigns lastPracticedAt onto the matching subject from the RPC result', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 'subject-a', last_practiced_at: '2026-05-20T10:00:00Z' },
        { subject_id: 'subject-b', last_practiced_at: '2026-05-17T08:00:00Z' },
      ],
      error: null,
    })
    const subjects = [
      { id: 'subject-a', lastPracticedAt: null },
      { id: 'subject-b', lastPracticedAt: null },
    ]

    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await applyLastPracticed(supabase, subjects)

    expect(result).toEqual([
      { id: 'subject-a', lastPracticedAt: '2026-05-20T10:00:00Z' },
      { id: 'subject-b', lastPracticedAt: '2026-05-17T08:00:00Z' },
    ])
  })

  it('leaves lastPracticedAt null for subjects absent from the RPC result', async () => {
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 'subject-a', last_practiced_at: '2026-05-20T10:00:00Z' }],
      error: null,
    })

    const subjects = [{ id: 'subject-x', lastPracticedAt: null }]
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await applyLastPracticed(supabase, subjects)

    expect(result).toEqual([{ id: 'subject-x', lastPracticedAt: null }])
  })

  it('leaves all lastPracticedAt values null when the RPC returns null data without an error', async () => {
    // PostgREST can return { data: null, error: null } when the student has no responses at all.
    // The data ?? [] fallback must produce an empty map so no subject is incorrectly updated.
    mockRpc.mockResolvedValue({ data: null, error: null })

    const subjects = [
      { id: 'subject-a', lastPracticedAt: null },
      { id: 'subject-b', lastPracticedAt: null },
    ]
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await applyLastPracticed(supabase, subjects)
    expect(result).toEqual([
      { id: 'subject-a', lastPracticedAt: null },
      { id: 'subject-b', lastPracticedAt: null },
    ])
  })

  it('throws a sanitized error when the last-practiced RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const subjects = [{ id: 'subject-a', lastPracticedAt: null }]
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    await expect(applyLastPracticed(supabase, subjects)).rejects.toThrow(
      'Failed to fetch last-practiced: boom',
    )
  })
})
