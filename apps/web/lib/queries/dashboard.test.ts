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
 * getDashboardData reads three data sources via the rpc() wrapper (mocked through mockRpc)
 * and two via .from():
 *   .from('easa_subjects')     -> subject list (getSubjectProgress)
 *   .from('student_responses') -> count head only (getTotalAnswered + getQuestionsToday)
 *   rpc 'get_student_mastery_stats'   -> per-subject mastery counts
 *   rpc 'get_student_streak'          -> current/best streak
 *   rpc 'get_student_last_practiced'  -> subject_id -> last_practiced_at
 *
 * rpc() is called as rpc(supabase, fn, args), so mockRpc receives (supabase, fn, args).
 * setRpc dispatches on the function name so each RPC can be driven independently.
 * Since buildChain returns the same value for all chain calls on a table, the
 * 'student_responses' mock only needs its `count` field.
 */

type RpcResult = { data: unknown; error: { message: string } | null }

/** Drives the three dashboard RPCs by name. Unset args resolve to safe empties. */
function setRpc(opts: {
  mastery?: unknown[]
  streak?: { current_streak: number | string; best_streak: number | string }[]
  lastPracticed?: { subject_id: string; last_practiced_at: string }[]
}) {
  mockRpc.mockImplementation((_supabase: unknown, fn: string): Promise<RpcResult> => {
    if (fn === 'get_student_mastery_stats') {
      return Promise.resolve({ data: opts.mastery ?? [], error: null })
    }
    if (fn === 'get_student_streak') {
      return Promise.resolve({
        data: opts.streak ?? [{ current_streak: 0, best_streak: 0 }],
        error: null,
      })
    }
    if (fn === 'get_student_last_practiced') {
      return Promise.resolve({ data: opts.lastPracticed ?? [], error: null })
    }
    throw new Error(`Unexpected RPC: ${fn}`)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  setRpc({})
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
      if (table === 'student_responses') return buildChain({ count: 0 })
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

    setRpc({ mastery: [{ subject_id: 's1', topic_id: null, total: 2, correct: 1 }] })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 10 })
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

    setRpc({
      mastery: [
        { subject_id: 's1', topic_id: null, total: 2, correct: 0 },
        { subject_id: 's2', topic_id: null, total: 1, correct: 0 },
      ],
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [
            { id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 },
            { id: 's2', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 2 },
          ],
        })
      if (table === 'student_responses') return buildChain({ count: 5 })
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
      if (table === 'student_responses') return buildChain({ count: 0 })
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
    setRpc({
      mastery: [{ subject_id: 's1', topic_id: null, total: 0, correct: 1 }],
      lastPracticed: [{ subject_id: 's1', last_practiced_at: '2026-03-18T10:00:00Z' }],
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AIRLAW', name: 'Air Law', short: 'AIR', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 1 })
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

    setRpc({ mastery: [{ subject_id: 's1', topic_id: null, total: 2, correct: 1 }] })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 1 })
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
    setRpc({ mastery: [{ subject_id: 's1', topic_id: null, total: 1, correct: 2 }] })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 2 })
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
      if (table === 'student_responses') return buildChain({ count: 7 })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.questionsToday).toBe(7)
  })

  it('surfaces the current and best streak from get_student_streak', async () => {
    // Streak semantics (gaps-and-islands over UTC dates) now live in SQL; the data layer
    // only wires the RPC result through to the dashboard payload.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    setRpc({ streak: [{ current_streak: 3, best_streak: 5 }] })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses') return buildChain({ count: 6 })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.currentStreak).toBe(3)
    expect(result.bestStreak).toBe(5)
  })

  it('reports a zero streak when the streak RPC returns no rows', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    setRpc({ streak: [] })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses') return buildChain({ count: 0 })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    expect(result.currentStreak).toBe(0)
    expect(result.bestStreak).toBe(0)
  })

  it('includes lastPracticedAt per subject from get_student_last_practiced', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const practiceDate = '2026-03-17T14:00:00Z'

    setRpc({
      mastery: [{ subject_id: 's1', topic_id: null, total: 1, correct: 1 }],
      lastPracticed: [{ subject_id: 's1', last_practiced_at: practiceDate }],
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 1 })
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

    setRpc({ mastery: [{ subject_id: 's_tail', topic_id: null, total: 1366, correct: 1366 }] })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's_tail', code: 'AIRLAW', name: 'Air Law', short: 'AIR', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 8395 })
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

  it('throws when the easa_subjects read returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({ data: null, error: { message: 'subjects db error' } })
      if (table === 'student_responses') return buildChain({ count: 0 })
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(getDashboardData()).rejects.toThrow('Failed to fetch subjects: subjects db error')
  })

  it('throws when the student_responses count read errors instead of degrading to 0', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_responses')
        return buildChain({ count: null, error: { message: 'boom' } })
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AIR', name: 'Air Law', short: 'AL', sort_order: 1 }],
        })
      throw new Error(`Unexpected table: ${table}`)
    })
    // mastery/streak/last-practiced RPCs succeed so the only failure is the count read
    setRpc({
      mastery: [],
      streak: [{ current_streak: 0, best_streak: 0 }],
      lastPracticed: [],
    })
    // getTotalAnswered and getQuestionsToday both read student_responses under the same
    // Promise.all, so either may reject first — match the shared prefix, not a specific message.
    await expect(getDashboardData()).rejects.toThrow(/Failed to fetch/)
  })

  it('filters out all subjects when the mastery RPC returns null data without an error', async () => {
    // Array.isArray(null) → false → masteryBySubject stays empty → every subject gets
    // totalQuestions: 0, answeredCorrectly: 0, which fails the survival filter.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockImplementation((_supabase: unknown, fn: string): Promise<RpcResult> => {
      if (fn === 'get_student_mastery_stats') {
        return Promise.resolve({ data: null, error: null })
      }
      if (fn === 'get_student_streak') {
        return Promise.resolve({ data: [{ current_streak: 0, best_streak: 0 }], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 1 })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getDashboardData()
    // No mastery data means 0 total and 0 correct for all subjects → all filtered out.
    expect(result.subjects).toHaveLength(0)
    expect(result.totalQuestions).toBe(0)
  })

  it('throws when the mastery stats RPC returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockImplementation((_supabase: unknown, fn: string): Promise<RpcResult> => {
      if (fn === 'get_student_mastery_stats') {
        return Promise.resolve({ data: null, error: { message: 'boom' } })
      }
      return Promise.resolve({ data: [], error: null })
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 0 })
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(getDashboardData()).rejects.toThrow('Failed to fetch mastery stats: boom')
  })

  it('throws when the streak RPC returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockRpc.mockImplementation((_supabase: unknown, fn: string): Promise<RpcResult> => {
      if (fn === 'get_student_streak') {
        return Promise.resolve({ data: null, error: { message: 'streak down' } })
      }
      return Promise.resolve({ data: [], error: null })
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'student_responses') return buildChain({ count: 0 })
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(getDashboardData()).rejects.toThrow('Failed to fetch streak: streak down')
  })

  it('throws when the last-practiced RPC returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    // last-practiced only runs when there is at least one surviving subject.
    mockRpc.mockImplementation((_supabase: unknown, fn: string): Promise<RpcResult> => {
      if (fn === 'get_student_mastery_stats') {
        return Promise.resolve({
          data: [{ subject_id: 's1', topic_id: null, total: 1, correct: 1 }],
          error: null,
        })
      }
      if (fn === 'get_student_last_practiced') {
        return Promise.resolve({ data: null, error: { message: 'lp down' } })
      }
      return Promise.resolve({ data: [{ current_streak: 0, best_streak: 0 }], error: null })
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 1 })
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(getDashboardData()).rejects.toThrow('Failed to fetch last-practiced: lp down')
  })

  it('coerces bigint-as-string total and correct from the RPC into numbers', async () => {
    // PostgREST may return bigint columns as strings depending on driver version.
    // The MasteryRow type is `total: number | string` and production code calls Number().
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    setRpc({ mastery: [{ subject_id: 's1', topic_id: null, total: '6', correct: '3' }] })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 3 })
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

    setRpc({
      mastery: [
        // Subject-level row: 10 total, 5 correct.
        { subject_id: 's1', topic_id: null, total: 10, correct: 5 },
        // Topic-level rows that must be ignored.
        { subject_id: 's1', topic_id: 't1', total: 6, correct: 3 },
        { subject_id: 's1', topic_id: 't2', total: 4, correct: 2 },
      ],
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'student_responses') return buildChain({ count: 5 })
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

    setRpc({
      mastery: [
        { subject_id: 's1', topic_id: null, total: 5, correct: 3 }, // active
        { subject_id: 's2', topic_id: null, total: 0, correct: 1 }, // orphan
      ],
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [
            { id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 },
            { id: 's2', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 2 },
          ],
        })
      if (table === 'student_responses') return buildChain({ count: 4 })
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
