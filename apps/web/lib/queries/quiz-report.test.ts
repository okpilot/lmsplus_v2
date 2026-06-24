import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

const { mockFetchAllRows } = vi.hoisted(() => ({ mockFetchAllRows: vi.fn() }))
vi.mock('@/lib/supabase-paginate', () => ({ fetchAllRows: mockFetchAllRows }))

const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-1' } },
})

const mockRpc = vi.fn()

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: mockFrom,
    rpc: mockRpc,
    auth: { getUser: mockGetUser },
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { getQuizReportSummary } from './quiz-report'

// ---- Helpers --------------------------------------------------------------

/** Builds a fluent chain stub: from().select().eq()...returns().maybeSingle() */
function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const terminalProxy = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => terminalProxy
    },
  })
  return terminalProxy
}

function mockFromSequence(...responses: unknown[]) {
  let call = 0
  mockFrom.mockImplementation(() => buildChain(responses[call++] ?? { data: null }))
}

// ---- Fixtures -------------------------------------------------------------

const sessionRow = {
  id: 'sess-1',
  mode: 'quick_quiz',
  subject_id: null as string | null,
  started_at: '2026-03-12T10:00:00Z',
  ended_at: '2026-03-12T10:05:00Z',
  total_questions: 2,
  correct_count: 1,
  score_percentage: 50,
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getQuizReportSummary
// ---------------------------------------------------------------------------

describe('getQuizReportSummary', () => {
  it('returns null when user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await getQuizReportSummary('sess-1')
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns null when auth returns an error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'token expired' },
    })
    const result = await getQuizReportSummary('sess-1')
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns null when session does not exist', async () => {
    mockFromSequence({ data: null })
    const result = await getQuizReportSummary('nonexistent')
    expect(result).toBeNull()
  })

  it('returns null when session is still active to prevent mid-session answer exposure', async () => {
    const activeSession = { ...sessionRow, ended_at: null }
    mockFromSequence({ data: activeSession })
    const result = await getQuizReportSummary('sess-1')
    expect(result).toBeNull()
  })

  it('does not query answers or subjects when session is active', async () => {
    const activeSession = { ...sessionRow, ended_at: null }
    mockFromSequence({ data: activeSession })
    await getQuizReportSummary('sess-1')
    // Only the session query should have fired; fetchAllRows must not be called
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFetchAllRows).not.toHaveBeenCalled()
  })

  it('reports both item and question answer counts from quiz_session_answers', async () => {
    // session query; answer-rows read now goes through fetchAllRows. q1 appears
    // twice (a 2-blank dialog) and q2 once → 3 items, 2 distinct questions.
    const answerRows = [{ question_id: 'q1' }, { question_id: 'q1' }, { question_id: 'q2' }]
    mockFromSequence({ data: sessionRow })
    mockFetchAllRows.mockResolvedValueOnce({ data: answerRows, error: null })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary!.sessionId).toBe('sess-1')
    expect(summary!.mode).toBe('quick_quiz')
    expect(summary!.subjectName).toBeNull()
    expect(summary!.totalQuestions).toBe(2)
    expect(summary!.answeredItems).toBe(3)
    expect(summary!.answeredQuestions).toBe(2)
    expect(summary!.correctCount).toBe(1)
    expect(summary!.scorePercentage).toBe(50)
    expect(summary!.startedAt).toBe('2026-03-12T10:00:00Z')
    expect(summary!.endedAt).toBe('2026-03-12T10:05:00Z')
  })

  it('summary does not include questions field', async () => {
    mockFromSequence({ data: sessionRow })
    mockFetchAllRows.mockResolvedValueOnce({
      data: [{ question_id: 'q1' }, { question_id: 'q2' }],
      error: null,
    })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary).not.toHaveProperty('questions')
  })

  it('returns null when the answer-rows query fails', async () => {
    mockFromSequence({ data: sessionRow })
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: { message: 'db error' } })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).toBeNull()
  })

  it('resolves subject name when subject_id is present', async () => {
    const sessionWithSubject = { ...sessionRow, subject_id: 'sub-1' }
    // session query then subject query; answer-rows go through fetchAllRows
    mockFromSequence({ data: sessionWithSubject }, { data: { name: 'Meteorology' } })
    mockFetchAllRows.mockResolvedValueOnce({
      data: [{ question_id: 'q1' }, { question_id: 'q2' }],
      error: null,
    })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary!.subjectName).toBe('Meteorology')
  })

  it('falls back to null subjectName when subject lookup fails', async () => {
    const sessionWithSubject = { ...sessionRow, subject_id: 'sub-1' }
    // session query then subject query (which fails); answer-rows go through fetchAllRows
    mockFromSequence(
      { data: sessionWithSubject },
      { data: null, error: { message: 'relation not found' } },
    )
    mockFetchAllRows.mockResolvedValueOnce({
      data: [{ question_id: 'q1' }, { question_id: 'q2' }],
      error: null,
    })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary!.subjectName).toBeNull()
  })

  it('falls back to zero scorePercentage when session score_percentage is null', async () => {
    const sessionWithNullScore = { ...sessionRow, score_percentage: null }
    mockFromSequence({ data: sessionWithNullScore })
    mockFetchAllRows.mockResolvedValueOnce({
      data: [{ question_id: 'q1' }, { question_id: 'q2' }],
      error: null,
    })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary!.scorePercentage).toBe(0)
  })

  it('reports zero answered items and questions when no answers exist', async () => {
    mockFromSequence({ data: sessionRow })
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: null })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary!.answeredItems).toBe(0)
    expect(summary!.answeredQuestions).toBe(0)
  })

  it('coerces string wire value for score_percentage to number', async () => {
    // PostgREST serialises NUMERIC as a JSON string; verify coercion to number.
    const sessionWithStringScore = { ...sessionRow, score_percentage: '73.33' }
    mockFromSequence({ data: sessionWithStringScore })
    mockFetchAllRows.mockResolvedValueOnce({
      data: [{ question_id: 'q1' }, { question_id: 'q2' }],
      error: null,
    })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary!.scorePercentage).toBe(73.33)
    expect(typeof summary!.scorePercentage).toBe('number')
  })

  it('returns null when the answer-rows page fetch fails after a successful count', async () => {
    mockFromSequence({ data: sessionRow })
    mockFetchAllRows.mockResolvedValueOnce({
      data: [],
      error: { message: 'page-level DB timeout' },
    })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).toBeNull()
  })
})
