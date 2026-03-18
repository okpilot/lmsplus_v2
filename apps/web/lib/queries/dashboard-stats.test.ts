import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: mockFrom,
  }),
}))

// ---- Subject under test ----------------------------------------------------

import {
  applyLastPracticed,
  computeExamReadiness,
  computeStreaks,
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

/** Returns an ISO date string N days offset from the pinned "today". */
function isoDate(offsetDays: number, pinnedToday: string): string {
  const d = new Date(pinnedToday)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

// Stable "today" used across all date-sensitive tests so they never flap at midnight.
const PINNED_TODAY = '2026-03-18'
const PINNED_TODAY_MS = new Date(PINNED_TODAY).getTime()

// ---- Setup -----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

// ---- computeStreaks ---------------------------------------------------------

describe('computeStreaks', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(PINNED_TODAY_MS)
  })

  it('returns zero streak when no dates are provided', () => {
    expect(computeStreaks([])).toEqual({ currentStreak: 0, bestStreak: 0 })
  })

  it('returns streak of 1 when only today is present', () => {
    expect(computeStreaks([PINNED_TODAY])).toEqual({ currentStreak: 1, bestStreak: 1 })
  })

  it('returns streak of 1 when only yesterday is present', () => {
    const yesterday = isoDate(-1, PINNED_TODAY)
    expect(computeStreaks([yesterday])).toEqual({ currentStreak: 1, bestStreak: 1 })
  })

  it('returns zero current streak when the most recent date is two days ago', () => {
    const twoDaysAgo = isoDate(-2, PINNED_TODAY)
    expect(computeStreaks([twoDaysAgo])).toEqual({ currentStreak: 0, bestStreak: 1 })
  })

  it('counts consecutive days anchored to today', () => {
    const dates = [PINNED_TODAY, isoDate(-1, PINNED_TODAY), isoDate(-2, PINNED_TODAY)]
    expect(computeStreaks(dates)).toEqual({ currentStreak: 3, bestStreak: 3 })
  })

  it('counts consecutive days anchored to yesterday', () => {
    const dates = [isoDate(-1, PINNED_TODAY), isoDate(-2, PINNED_TODAY), isoDate(-3, PINNED_TODAY)]
    expect(computeStreaks(dates)).toEqual({ currentStreak: 3, bestStreak: 3 })
  })

  it('identifies best streak even when current streak is shorter', () => {
    // Gap at -3, so current streak = 3, but older run was 4 long
    const dates = [
      PINNED_TODAY,
      isoDate(-1, PINNED_TODAY),
      isoDate(-2, PINNED_TODAY),
      // gap at -3
      isoDate(-4, PINNED_TODAY),
      isoDate(-5, PINNED_TODAY),
      isoDate(-6, PINNED_TODAY),
      isoDate(-7, PINNED_TODAY),
    ]
    expect(computeStreaks(dates)).toEqual({ currentStreak: 3, bestStreak: 4 })
  })

  it('resets current streak to 0 when there is a gap before today', () => {
    // Most recent practice was 5 days ago followed by a 3-day run
    const dates = [isoDate(-5, PINNED_TODAY), isoDate(-6, PINNED_TODAY), isoDate(-7, PINNED_TODAY)]
    const result = computeStreaks(dates)
    expect(result.currentStreak).toBe(0)
    expect(result.bestStreak).toBe(3)
  })

  it('handles a single-element list of a stale date', () => {
    const stale = isoDate(-10, PINNED_TODAY)
    expect(computeStreaks([stale])).toEqual({ currentStreak: 0, bestStreak: 1 })
  })

  it('handles duplicate dates gracefully when they are already deduplicated', () => {
    // Caller (getStreakData) deduplicates before passing; test verifies non-consecutive pair
    const dates = [PINNED_TODAY, isoDate(-2, PINNED_TODAY)]
    // Gap on day -1 means current streak is only 1 (today), best streak is 1
    expect(computeStreaks(dates)).toEqual({ currentStreak: 1, bestStreak: 1 })
  })
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
})

// ---- getStreakData ----------------------------------------------------------

describe('getStreakData', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(PINNED_TODAY_MS)
  })

  it('returns zero streaks when there are no responses', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null }))
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await getStreakData(supabase, 'user-1')
    expect(result).toEqual({ currentStreak: 0, bestStreak: 0 })
  })

  it('deduplicates dates and computes streak from multiple responses on the same day', async () => {
    // Three responses today and yesterday — should be a streak of 2, not 3
    const yesterday = isoDate(-1, PINNED_TODAY)
    const rows = [
      { created_at: `${PINNED_TODAY}T10:00:00Z` },
      { created_at: `${PINNED_TODAY}T14:00:00Z` },
      { created_at: `${yesterday}T09:00:00Z` },
    ]
    mockFrom.mockReturnValue(buildChain({ data: rows }))
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await getStreakData(supabase, 'user-1')
    expect(result).toEqual({ currentStreak: 2, bestStreak: 2 })
  })
})

// ---- applyLastPracticed ----------------------------------------------------

describe('applyLastPracticed', () => {
  it('returns the same list unchanged when subjects is empty', async () => {
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await applyLastPracticed(supabase, 'user-1', [], new Map())
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('assigns lastPracticedAt from the latest response for each subject', async () => {
    const rows = [
      { question_id: 'q1', created_at: '2026-03-18T10:00:00Z' },
      { question_id: 'q2', created_at: '2026-03-17T08:00:00Z' },
      // older response for q1 — should be ignored since q1 is already set
      { question_id: 'q1', created_at: '2026-03-10T10:00:00Z' },
    ]
    mockFrom.mockReturnValue(buildChain({ data: rows }))

    const questionSubjectMap = new Map([
      ['q1', 'subject-a'],
      ['q2', 'subject-b'],
    ])
    const subjects = [
      { id: 'subject-a', lastPracticedAt: null },
      { id: 'subject-b', lastPracticedAt: null },
    ]

    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await applyLastPracticed(supabase, 'user-1', subjects, questionSubjectMap)

    expect(result).toEqual([
      { id: 'subject-a', lastPracticedAt: '2026-03-18T10:00:00Z' },
      { id: 'subject-b', lastPracticedAt: '2026-03-17T08:00:00Z' },
    ])
  })

  it('leaves lastPracticedAt null for subjects with no responses', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [] }))

    const subjects = [{ id: 'subject-x', lastPracticedAt: null }]
    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await applyLastPracticed(supabase, 'user-1', subjects, new Map())

    expect(result).toEqual([{ id: 'subject-x', lastPracticedAt: null }])
  })

  it('ignores responses whose question_id is not in the subject map', async () => {
    const rows = [{ question_id: 'unknown-q', created_at: '2026-03-18T10:00:00Z' }]
    mockFrom.mockReturnValue(buildChain({ data: rows }))

    const subjects = [{ id: 'subject-a', lastPracticedAt: null }]
    // 'unknown-q' is not in the map
    const questionSubjectMap = new Map<string, string>()

    const { createServerSupabaseClient } = await import('@repo/db/server')
    const supabase = await createServerSupabaseClient()
    const result = await applyLastPracticed(supabase, 'user-1', subjects, questionSubjectMap)

    expect(result).toEqual([{ id: 'subject-a', lastPracticedAt: null }])
  })
})
