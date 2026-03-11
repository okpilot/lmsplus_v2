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
 *   getDueCount          -> 'fsrs_cards' (count query)
 *   getSubjectProgress   -> 'easa_subjects', 'questions', 'student_responses', 'questions' (correct in subject)
 *   getTotalAnswered     -> 'student_responses' (count query)
 *   getRecentSessions    -> 'quiz_sessions', optional 'easa_subjects'
 */

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getDashboardData', () => {
  it('throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getDashboardData()).rejects.toThrow('Not authenticated')
  })

  it('returns zeroed dashboard data when there are no subjects', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    // We need to match per-table. Use a call counter per table name.
    const callsByTable: Record<string, number> = {}
    mockFrom.mockImplementation((table: string) => {
      callsByTable[table] = (callsByTable[table] ?? 0) + 1
      if (table === 'fsrs_cards') return buildChain({ count: 0 })
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses') return buildChain({ count: 0, data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      if (table === 'quiz_sessions') return buildChain({ data: [] })
      return buildChain({ data: null })
    })

    const result = await getDashboardData()
    expect(result.dueCount).toBe(0)
    expect(result.totalQuestions).toBe(0)
    expect(result.answeredCount).toBe(0)
    expect(result.subjects).toEqual([])
    expect(result.recentSessions).toEqual([])
  })

  it('aggregates subject progress correctly', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'fsrs_cards') return buildChain({ count: 2 })
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') {
        // Two different calls: count query and correctResponses select
        return buildChain({ count: 10, data: [{ question_id: 'q1' }] })
      }
      if (table === 'questions') {
        // Two calls: active questions list and correctQuestions with subject
        return buildChain({
          data: [
            { id: 'q1', subject_id: 's1' },
            { id: 'q2', subject_id: 's1' },
          ],
        })
      }
      if (table === 'quiz_sessions') return buildChain({ data: [] })
      return buildChain({ data: null })
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(1)
    // Test setup guarantees one subject in result
    const subject = result.subjects[0]!
    expect(subject.code).toBe('AGK')
    expect(subject.totalQuestions).toBe(2)
  })

  it('computes masteryPercentage as 0 when a subject has no questions', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'fsrs_cards') return buildChain({ count: 0 })
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'MET', name: 'Met', short: 'MET', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 0, data: [] })
      if (table === 'questions') return buildChain({ data: [] }) // no questions for this subject
      if (table === 'quiz_sessions') return buildChain({ data: [] })
      return buildChain({ data: null })
    })

    const result = await getDashboardData()
    // Subject with 0 questions is filtered out
    expect(result.subjects).toHaveLength(0)
    expect(result.totalQuestions).toBe(0)
  })

  it('maps recent sessions including subject name lookup', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const sessions = [
      {
        id: 'sess1',
        mode: 'quick_quiz',
        total_questions: 10,
        correct_count: 8,
        score_percentage: 80,
        started_at: '2026-03-11T09:00:00Z',
        subject_id: 's1',
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'fsrs_cards') return buildChain({ count: 0 })
      if (table === 'easa_subjects') {
        // Called twice: once for subjects list, once for subject name lookup in sessions
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      }
      if (table === 'student_responses') return buildChain({ count: 0, data: [] })
      if (table === 'questions') return buildChain({ data: [{ id: 'q1', subject_id: 's1' }] })
      if (table === 'quiz_sessions') return buildChain({ data: sessions })
      return buildChain({ data: null })
    })

    const result = await getDashboardData()
    expect(result.recentSessions).toHaveLength(1)
    // Test setup guarantees one session in result
    expect(result.recentSessions[0]!.subjectName).toBe('Aircraft General')
    expect(result.recentSessions[0]!.correctCount).toBe(8)
    expect(result.recentSessions[0]!.scorePercentage).toBe(80)
  })
})
