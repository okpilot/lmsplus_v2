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
  vi.resetAllMocks()
})

describe('getDashboardData', () => {
  it('rejects unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getDashboardData()).rejects.toThrow('Not authenticated')
  })

  it('throws when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'token expired' },
    })
    await expect(getDashboardData()).rejects.toThrow('Auth error: token expired')
  })

  it('returns zeroed counters when the org has no subjects', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'fsrs_cards') return buildChain({ count: 0 })
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses') return buildChain({ count: 0, data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      if (table === 'quiz_sessions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.dueCount).toBe(0)
    expect(result.totalQuestions).toBe(0)
    expect(result.answeredCount).toBe(0)
    expect(result.subjects).toEqual([])
    expect(result.recentSessions).toEqual([])
  })

  it('computes question counts and mastery per subject', async () => {
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
      if (table === 'fsrs_cards') return buildChain({ count: 0 })
      if (table === 'easa_subjects')
        return buildChain({
          data: [
            { id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 },
            { id: 's2', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 2 },
          ],
        })
      if (table === 'student_responses')
        return buildChain({ count: 5, data: [{ question_id: 'q1' }] })
      if (table === 'questions')
        return buildChain({
          data: [
            { id: 'q1', subject_id: 's1' },
            { id: 'q2', subject_id: 's1' },
            { id: 'q3', subject_id: 's2' },
          ],
        })
      if (table === 'quiz_sessions') return buildChain({ data: [] })
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
      if (table === 'fsrs_cards') return buildChain({ count: 0 })
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'MET', name: 'Met', short: 'MET', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 0, data: [] })
      if (table === 'questions') return buildChain({ data: [] }) // no questions for this subject
      if (table === 'quiz_sessions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    // Subject with 0 questions is filtered out
    expect(result.subjects).toHaveLength(0)
    expect(result.totalQuestions).toBe(0)
  })

  it('enriches recent sessions with the subject display name', async () => {
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
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.recentSessions).toHaveLength(1)
    // Test setup guarantees one session in result
    expect(result.recentSessions[0]!.subjectName).toBe('Aircraft General')
    expect(result.recentSessions[0]!.correctCount).toBe(8)
    expect(result.recentSessions[0]!.scorePercentage).toBe(80)
  })
})
