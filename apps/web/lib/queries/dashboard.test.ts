import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
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
 *   getSubjectProgressWithMap -> 'easa_subjects', 'questions' (last-practiced map only)
 *   getTotalAnswered          -> 'student_responses' (count query)
 *   getQuestionsToday         -> 'student_responses' (count + gte filter)
 *   getStreakData             -> 'student_responses' (created_at select)
 *   applyLastPracticed        -> 'student_responses' (question_id, created_at)
 *
 * Per-subject mastery counts (totalQuestions/answeredCorrectly) now come from the
 * get_student_mastery_stats RPC (mocked via mockRpc), NOT from .from('questions')/
 * .from('student_responses'). The single surviving 'questions' read only feeds the
 * last-practiced attribution map. Since buildChain returns the same value for all chain
 * calls on a table, we set both `count` and `data` so all consumer shapes work from one
 * mock value.
 */

beforeEach(() => {
  vi.resetAllMocks()
  mockRpc.mockResolvedValue({ data: [], error: null })
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

    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: 2, correct: 1 }],
      error: null,
    })

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
    expect(subject.answeredCorrectly).toBe(1)
    expect(subject.masteryPercentage).toBe(50)
  })

  it('attributes questions to the correct subject across multiple subjects', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: null, total: 2, correct: 0 },
        { subject_id: 's2', topic_id: null, total: 1, correct: 0 },
      ],
      error: null,
    })

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

  it('excludes subjects with zero questions AND zero responses', async () => {
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
    // Subject with 0 questions AND 0 responses is filtered out
    expect(result.subjects).toHaveLength(0)
    expect(result.totalQuestions).toBe(0)
  })

  it('keeps subject when it has no active questions but the student has correct responses to it', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    // Orphan subject: 0 active questions, 1 correct response to a now-draft question.
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: 0, correct: 1 }],
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AIRLAW', name: 'Air Law', short: 'AIR', sort_order: 1 }],
        })
      if (table === 'student_responses')
        return buildChain({
          count: 1,
          data: [{ question_id: 'q1', created_at: '2026-03-18T10:00:00Z' }],
        })
      // Last-practiced attribution map: q1 belongs to s1 (non-deleted, any status).
      if (table === 'questions') return buildChain({ data: [{ id: 'q1', subject_id: 's1' }] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(1)
    expect(result.subjects[0]!.id).toBe('s1')
    expect(result.subjects[0]!.totalQuestions).toBe(0)
    expect(result.subjects[0]!.answeredCorrectly).toBe(1)
    expect(result.subjects[0]!.masteryPercentage).toBe(0)
    expect(result.subjects[0]!.lastPracticedAt).toBe('2026-03-18T10:00:00Z')
  })

  it('counts only active questions in totalQuestions but attributes draft-question responses to their subject', async () => {
    // Central scenario for #540: subject has 2 active questions; the student answered one
    // now-draft question correctly. The RPC reports total = 2 (active only) and correct = 1
    // (correct response to a non-deleted, any-status question).
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: 2, correct: 1 }],
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 1 }],
        })
      if (table === 'student_responses')
        return buildChain({
          count: 1,
          data: [{ question_id: 'q_draft', created_at: '2026-03-18T10:00:00Z' }],
        })
      // Last-practiced attribution map only (any-status non-deleted).
      if (table === 'questions') return buildChain({ data: [{ id: 'q_draft', subject_id: 's1' }] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(1)
    const subject = result.subjects[0]!
    expect(subject.totalQuestions).toBe(2)
    expect(subject.answeredCorrectly).toBe(1)
    expect(subject.masteryPercentage).toBe(50)
  })

  it('caps masteryPercentage at 100 when correct responses exceed the active question count', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    // 1 active question, 2 correct responses (one to a now-draft question) -> correct > total.
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: 1, correct: 2 }],
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 1 }],
        })
      if (table === 'student_responses')
        return buildChain({
          count: 2,
          data: [
            { question_id: 'q1', created_at: '2026-03-18T10:00:00Z' },
            { question_id: 'q_draft', created_at: '2026-03-18T10:00:00Z' },
          ],
        })
      // Last-practiced attribution map only (any-status non-deleted).
      if (table === 'questions')
        return buildChain({
          data: [
            { id: 'q1', subject_id: 's1' },
            { id: 'q_draft', subject_id: 's1' },
          ],
        })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    const subject = result.subjects[0]!
    expect(subject.totalQuestions).toBe(1)
    expect(subject.answeredCorrectly).toBe(2)
    expect(subject.masteryPercentage).toBe(100)
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

    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: 1, correct: 1 }],
      error: null,
    })

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

  it('counts a subject whose responses fall outside the legacy 1000-row window (#540 regression)', async () => {
    // The RPC aggregates in Postgres, so a subject with 1366 correct responses is reported
    // in full — under the old client read these rows truncated at the 1000-row cap and the
    // subject showed 0% mastery (#540).
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's_tail', topic_id: null, total: 1366, correct: 1366 }],
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's_tail', code: 'AIRLAW', name: 'Air Law', short: 'AIR', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 8395, data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(1)
    const subject = result.subjects[0]!
    expect(subject.id).toBe('s_tail')
    expect(subject.totalQuestions).toBe(1366)
    expect(subject.answeredCorrectly).toBe(1366)
    expect(subject.masteryPercentage).toBe(100)
  })

  it('throws when the mastery stats RPC returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 0, data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(getDashboardData()).rejects.toThrow('Failed to fetch mastery stats: boom')
  })

  it('coerces bigint-as-string total and correct from the RPC into numbers', async () => {
    // PostgREST may return bigint columns as strings depending on driver version.
    // The MasteryRow type is `total: number | string` and production code calls Number().
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: null, total: '6', correct: '3' }],
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 3, data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(1)
    const subject = result.subjects[0]!
    expect(subject.totalQuestions).toBe(6)
    expect(subject.answeredCorrectly).toBe(3)
    expect(subject.masteryPercentage).toBe(50)
  })

  it('ignores topic-level RPC rows and uses only subject-level rows for subject mastery', async () => {
    // The RPC returns both topic_id=null (subject-level) and topic_id!=null (topic-level) rows.
    // dashboard.ts uses the `continue` guard to skip topic-level rows. If those rows were
    // accidentally accumulated, totalQuestions and answeredCorrectly would be inflated.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockResolvedValue({
      data: [
        // Subject-level row: 10 total, 5 correct.
        { subject_id: 's1', topic_id: null, total: 10, correct: 5 },
        // Topic-level rows that must be ignored.
        { subject_id: 's1', topic_id: 't1', total: 6, correct: 3 },
        { subject_id: 's1', topic_id: 't2', total: 4, correct: 2 },
      ],
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 5, data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(1)
    const subject = result.subjects[0]!
    // Must reflect subject-level row only, not the sum of topic rows.
    expect(subject.totalQuestions).toBe(10)
    expect(subject.answeredCorrectly).toBe(5)
    expect(subject.masteryPercentage).toBe(50)
  })

  it('returns active and orphan subjects together when both appear in the same RPC result', async () => {
    // One subject has active questions (total > 0); the other is an orphan
    // (total: 0, correct: 1 — answered a now-draft question). Both must appear in the output.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockResolvedValue({
      data: [
        { subject_id: 's1', topic_id: null, total: 5, correct: 3 }, // active
        { subject_id: 's2', topic_id: null, total: 0, correct: 1 }, // orphan
      ],
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [
            { id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 },
            { id: 's2', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 2 },
          ],
        })
      if (table === 'student_responses') return buildChain({ count: 4, data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.subjects).toHaveLength(2)

    const agk = result.subjects.find((s) => s.code === 'AGK')!
    expect(agk.totalQuestions).toBe(5)
    expect(agk.answeredCorrectly).toBe(3)
    expect(agk.masteryPercentage).toBe(60)

    const met = result.subjects.find((s) => s.code === 'MET')!
    expect(met.totalQuestions).toBe(0)
    expect(met.answeredCorrectly).toBe(1)
    expect(met.masteryPercentage).toBe(0)
  })
})
