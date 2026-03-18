import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

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

// ---- Subject under test ---------------------------------------------------

import { getDashboardData } from './dashboard'

// ---- Helpers --------------------------------------------------------------

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

/**
 * getDashboardData makes many parallel from() calls. We intercept by table name.
 * The order of from() calls:
 *   getSubjectProgressWithMap -> 'easa_subjects', 'questions', 'student_responses', 'questions'
 *   getTotalAnswered          -> 'student_responses' (count query)
 *   getQuestionsToday         -> 'student_responses' (count + gte filter)
 *   getStreakData             -> 'student_responses' (created_at select)
 *   applyLastPracticed        -> 'student_responses' (question_id, created_at)
 *
 * Since buildChain returns the same value for all chain calls on a table, we set
 * both `count` and `data` so all consumer shapes work from one mock value.
 */

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getDashboardData', () => {
  it('rejects unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getDashboardData()).rejects.toThrow('Not authenticated')
  })

  it('throws when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'token expired' },
    })
    await expect(getDashboardData()).rejects.toThrow('Auth error: token expired')
  })

  it('returns zeroed counters when the org has no subjects', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses') return buildChain({ count: 0, data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.totalQuestions).toBe(0)
    expect(result.answeredCount).toBe(0)
    expect(result.subjects).toEqual([])
    expect(result.questionsToday).toBe(0)
    expect(result.currentStreak).toBe(0)
    expect(result.bestStreak).toBe(0)
    expect(result.examReadiness).toEqual({ readyCount: 0, totalCount: 0, projectedDate: null })
  })

  it('computes question counts and mastery per subject', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') {
        return buildChain({
          count: 10,
          data: [{ question_id: 'q1', created_at: '2026-03-18T10:00:00Z' }],
        })
      }
      if (table === 'questions') {
        return buildChain({
          data: [
            { id: 'q1', subject_id: 's1' },
            { id: 'q2', subject_id: 's1' },
          ],
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(1)
    // Test setup guarantees one subject in result
    const subject = result.subjects[0]!
    expect(subject.code).toBe('AGK')
    expect(subject.totalQuestions).toBe(2)
  })

  it('attributes questions to the correct subject across multiple subjects', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [
            { id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 },
            { id: 's2', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 2 },
          ],
        })
      if (table === 'student_responses')
        return buildChain({
          count: 5,
          data: [{ question_id: 'q1', created_at: '2026-03-18T10:00:00Z' }],
        })
      if (table === 'questions')
        return buildChain({
          data: [
            { id: 'q1', subject_id: 's1' },
            { id: 'q2', subject_id: 's1' },
            { id: 'q3', subject_id: 's2' },
          ],
        })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(2)
    const agk = result.subjects.find((s) => s.code === 'AGK')
    const met = result.subjects.find((s) => s.code === 'MET')
    expect(agk!.totalQuestions).toBe(2)
    expect(met!.totalQuestions).toBe(1)
  })

  it('excludes subjects that have zero questions', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'MET', name: 'Met', short: 'MET', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 0, data: [] })
      if (table === 'questions') return buildChain({ data: [] }) // no questions for this subject
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    // Subject with 0 questions is filtered out
    expect(result.subjects).toHaveLength(0)
    expect(result.totalQuestions).toBe(0)
  })

  it('counts questions answered today', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses') return buildChain({ count: 7, data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.questionsToday).toBe(7)
  })

  it('computes current streak of consecutive days', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const today = new Date().toISOString().slice(0, 10)
    const d1 = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const d2 = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses')
        return buildChain({
          count: 3,
          data: [
            { question_id: 'q1', created_at: `${today}T10:00:00Z` },
            { question_id: 'q2', created_at: `${d1}T10:00:00Z` },
            { question_id: 'q3', created_at: `${d2}T10:00:00Z` },
          ],
        })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.currentStreak).toBe(3)
  })

  it('breaks streak on gap day', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const today = new Date().toISOString().slice(0, 10)
    // Skip yesterday — gap at d1
    const d2 = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses')
        return buildChain({
          count: 2,
          data: [
            { question_id: 'q1', created_at: `${today}T10:00:00Z` },
            { question_id: 'q2', created_at: `${d2}T10:00:00Z` },
          ],
        })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.currentStreak).toBe(1)
  })

  it('tracks best streak separately from current', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const today = new Date().toISOString().slice(0, 10)
    // Only practiced today (current streak = 1)
    // Historical 5-day streak 10–14 days ago
    const makeDate = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses')
        return buildChain({
          count: 6,
          data: [
            { question_id: 'q1', created_at: `${today}T10:00:00Z` },
            // gap at days 1-9
            { question_id: 'q2', created_at: `${makeDate(10)}T10:00:00Z` },
            { question_id: 'q3', created_at: `${makeDate(11)}T10:00:00Z` },
            { question_id: 'q4', created_at: `${makeDate(12)}T10:00:00Z` },
            { question_id: 'q5', created_at: `${makeDate(13)}T10:00:00Z` },
            { question_id: 'q6', created_at: `${makeDate(14)}T10:00:00Z` },
          ],
        })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.currentStreak).toBe(1)
    expect(result.bestStreak).toBe(5)
  })

  it('includes lastPracticedAt per subject', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const practiceDate = '2026-03-17T14:00:00Z'

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses')
        return buildChain({
          count: 1,
          data: [{ question_id: 'q1', created_at: practiceDate }],
        })
      if (table === 'questions')
        return buildChain({
          data: [{ id: 'q1', subject_id: 's1' }],
        })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(1)
    expect(result.subjects[0]!.lastPracticedAt).toBe(practiceDate)
  })
})
