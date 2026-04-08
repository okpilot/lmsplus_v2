import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

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
    // Only the session query should have fired
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('returns summary with answered count from quiz_session_answers', async () => {
    // session query, answered count query (head: true)
    mockFromSequence({ data: sessionRow }, { count: 2, data: null })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary!.sessionId).toBe('sess-1')
    expect(summary!.mode).toBe('quick_quiz')
    expect(summary!.subjectName).toBeNull()
    expect(summary!.totalQuestions).toBe(2)
    expect(summary!.answeredCount).toBe(2)
    expect(summary!.correctCount).toBe(1)
    expect(summary!.scorePercentage).toBe(50)
    expect(summary!.startedAt).toBe('2026-03-12T10:00:00Z')
    expect(summary!.endedAt).toBe('2026-03-12T10:05:00Z')
  })

  it('summary does not include questions field', async () => {
    mockFromSequence({ data: sessionRow }, { count: 2, data: null })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary).not.toHaveProperty('questions')
  })

  it('resolves subject name when subject_id is present', async () => {
    const sessionWithSubject = { ...sessionRow, subject_id: 'sub-1' }
    // session query, answered count query, subject query
    mockFromSequence(
      { data: sessionWithSubject },
      { count: 2, data: null },
      { data: { name: 'Meteorology' } },
    )
    const summary = await getQuizReportSummary('sess-1')
    expect(summary!.subjectName).toBe('Meteorology')
  })

  it('falls back to null subjectName when subject lookup fails', async () => {
    const sessionWithSubject = { ...sessionRow, subject_id: 'sub-1' }
    mockFromSequence(
      { data: sessionWithSubject },
      { count: 2, data: null },
      { data: null, error: { message: 'relation not found' } },
    )
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary!.subjectName).toBeNull()
  })

  it('falls back to zero scorePercentage when session score_percentage is null', async () => {
    const sessionWithNullScore = { ...sessionRow, score_percentage: null }
    mockFromSequence({ data: sessionWithNullScore }, { count: 2, data: null })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary!.scorePercentage).toBe(0)
  })

  it('falls back to total_questions answeredCount when count is null', async () => {
    mockFromSequence({ data: sessionRow }, { count: null, data: null })
    const summary = await getQuizReportSummary('sess-1')
    expect(summary).not.toBeNull()
    expect(summary!.answeredCount).toBe(sessionRow.total_questions)
  })
})
