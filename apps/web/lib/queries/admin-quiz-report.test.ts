import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAdminFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock('@repo/db/admin', () => ({
  adminClient: { from: mockAdminFrom },
}))

// ---- Subject under test ---------------------------------------------------

import { getAdminQuizReportQuestions, getAdminQuizReportSummary } from './admin-quiz-report'
import { PAGE_SIZE } from './quiz-report'

// ---- Helpers ---------------------------------------------------------------

const DEFAULT_ORG_ID = 'org-1'
const mockAuthRpc = vi.hoisted(() => vi.fn())

function makeAdminContext(overrides: Partial<{ organizationId: string }> = {}) {
  return {
    supabase: { rpc: mockAuthRpc } as unknown,
    userId: 'admin-1',
    organizationId: DEFAULT_ORG_ID,
    ...overrides,
  }
}

/**
 * Builds a fluent chain stub for adminClient.from() chains.
 * Every builder method returns the same chain; awaiting resolves with returnValue.
 */
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
  mockAdminFrom.mockImplementation(() => buildChain(responses[call++] ?? { data: null }))
}

// ---- Fixtures ---------------------------------------------------------------

const completedSession = {
  id: 'sess-1',
  mode: 'quick_quiz',
  subject_id: null as string | null,
  started_at: '2026-03-12T10:00:00Z',
  ended_at: '2026-03-12T10:15:00Z',
  total_questions: 5,
  correct_count: 3,
  score_percentage: 60,
  student_id: 'stu-1',
}

const answersData = [
  { question_id: 'q1', selected_option_id: 'opt-a', is_correct: true, response_time_ms: 2000 },
  { question_id: 'q2', selected_option_id: 'opt-c', is_correct: false, response_time_ms: 4500 },
]

const questionsData = [
  {
    id: 'q1',
    question_text: 'What is lift?',
    question_number: '050-01-001',
    options: [
      { id: 'opt-a', text: 'Upward force' },
      { id: 'opt-b', text: 'Downward force' },
    ],
    explanation_text: 'Lift acts upward.',
    explanation_image_url: null,
  },
  {
    id: 'q2',
    question_text: 'What is drag?',
    question_number: '050-01-002',
    options: [
      { id: 'opt-c', text: 'Forward force' },
      { id: 'opt-d', text: 'Opposing force' },
    ],
    explanation_text: null,
    explanation_image_url: null,
  },
]

const correctOptionsData = [
  { question_id: 'q1', correct_option_id: 'opt-a' },
  { question_id: 'q2', correct_option_id: 'opt-d' },
]

// ---- Tests -----------------------------------------------------------------

// ---------------------------------------------------------------------------
// getAdminQuizReportSummary
// ---------------------------------------------------------------------------

describe('getAdminQuizReportSummary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns null when session does not exist in org', async () => {
    // session query returns null
    mockFromSequence({ data: null })
    const result = await getAdminQuizReportSummary('nonexistent')
    expect(result).toBeNull()
  })

  it('returns null when session is still active to prevent mid-session answer exposure', async () => {
    const activeSession = { ...completedSession, ended_at: null }
    mockFromSequence({ data: activeSession })
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).toBeNull()
  })

  it('does not query answers or users when session has no ended_at', async () => {
    const activeSession = { ...completedSession, ended_at: null }
    mockFromSequence({ data: activeSession })
    await getAdminQuizReportSummary('sess-1')
    // Only the session query should have fired
    expect(mockAdminFrom).toHaveBeenCalledTimes(1)
  })

  it('returns summary with all fields for a completed session', async () => {
    // session, answered-count head query, users lookup
    mockFromSequence(
      { data: completedSession },
      { count: 4, data: null },
      { data: { full_name: 'Alice' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.sessionId).toBe('sess-1')
    expect(result!.mode).toBe('quick_quiz')
    expect(result!.totalQuestions).toBe(5)
    expect(result!.answeredCount).toBe(4)
    expect(result!.correctCount).toBe(3)
    expect(result!.scorePercentage).toBe(60)
    expect(result!.startedAt).toBe('2026-03-12T10:00:00Z')
    expect(result!.endedAt).toBe('2026-03-12T10:15:00Z')
    expect(result!.studentId).toBe('stu-1')
  })

  it('includes studentName resolved from users table', async () => {
    mockFromSequence(
      { data: completedSession },
      { count: 4, data: null },
      { data: { full_name: 'Alice' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result!.studentName).toBe('Alice')
  })

  it('falls back to null studentName when user lookup returns null', async () => {
    mockFromSequence({ data: completedSession }, { count: 4, data: null }, { data: null })
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.studentName).toBeNull()
  })

  it('falls back to null studentName when user lookup returns an error', async () => {
    mockFromSequence(
      { data: completedSession },
      { count: 4, data: null },
      { data: null, error: { message: 'row not found' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.studentName).toBeNull()
  })

  it('resolves subjectName when subject_id is present', async () => {
    const sessionWithSubject = { ...completedSession, subject_id: 'sub-1' }
    // session, answered-count head, subject lookup, users lookup
    mockFromSequence(
      { data: sessionWithSubject },
      { count: 4, data: null },
      { data: { name: 'Meteorology' } },
      { data: { full_name: 'Alice' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result!.subjectName).toBe('Meteorology')
  })

  it('falls back to null subjectName when subject lookup fails', async () => {
    const sessionWithSubject = { ...completedSession, subject_id: 'sub-1' }
    mockFromSequence(
      { data: sessionWithSubject },
      { count: 4, data: null },
      { data: null, error: { message: 'relation not found' } },
      { data: { full_name: 'Alice' } },
    )
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result).not.toBeNull()
    expect(result!.subjectName).toBeNull()
  })

  it('falls back to 0 scorePercentage when session score_percentage is null', async () => {
    const sessionNullScore = { ...completedSession, score_percentage: null }
    mockFromSequence({ data: sessionNullScore }, { count: 4, data: null }, { data: null })
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result!.scorePercentage).toBe(0)
  })

  it('falls back to 0 answeredCount when count is null', async () => {
    mockFromSequence({ data: completedSession }, { count: null, data: null }, { data: null })
    const result = await getAdminQuizReportSummary('sess-1')
    expect(result!.answeredCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getAdminQuizReportQuestions
// ---------------------------------------------------------------------------

describe('getAdminQuizReportQuestions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns error when sessionId is empty', async () => {
    const result = await getAdminQuizReportQuestions({ sessionId: '', page: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('Failed to load questions')
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('returns error when session does not exist in org', async () => {
    mockFromSequence({ data: null })
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when session is still active to prevent mid-session answer exposure', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: null } })
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('does not query answers or questions when session has no ended_at', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: null } })
    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    // Only the session guard query should have fired
    expect(mockAdminFrom).toHaveBeenCalledTimes(1)
  })

  it('returns error when count query fails', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: null, error: { message: 'db error' } },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns ok:true with empty questions when no answers exist', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 0, data: null },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })

  it('returns ok:true with empty questions when page exceeds total pages', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 5, data: null },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 99 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(5)
  })

  it('returns paginated questions with correct totalCount', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(2)
    expect(result.totalCount).toBe(2)
  })

  it('maps question fields correctly for a correct answer', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q1 = result.questions[0]!
    expect(q1.questionId).toBe('q1')
    expect(q1.questionText).toBe('What is lift?')
    expect(q1.questionNumber).toBe('050-01-001')
    expect(q1.isCorrect).toBe(true)
    expect(q1.selectedOptionId).toBe('opt-a')
    expect(q1.correctOptionId).toBe('opt-a')
    expect(q1.options).toEqual([
      { id: 'opt-a', text: 'Upward force' },
      { id: 'opt-b', text: 'Downward force' },
    ])
    expect(q1.explanationText).toBe('Lift acts upward.')
    expect(q1.explanationImageUrl).toBeNull()
    expect(q1.responseTimeMs).toBe(2000)
  })

  it('identifies incorrect answers with the correct option from the RPC', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q2 = result.questions[1]!
    expect(q2.isCorrect).toBe(false)
    expect(q2.selectedOptionId).toBe('opt-c')
    expect(q2.correctOptionId).toBe('opt-d')
  })

  it('returns error when answers query fails', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: null, error: { message: 'answers query failed' } },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when questions query fails', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: answersData },
      { data: null, error: { message: 'questions query failed' } },
    )
    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when correct-options RPC fails', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('calls the RPC with get_admin_report_correct_options and the session id', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 2, data: null },
      { data: answersData },
      { data: questionsData },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: correctOptionsData, error: null })

    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })

    expect(mockAuthRpc).toHaveBeenCalledWith('get_admin_report_correct_options', {
      p_session_id: 'sess-1',
    })
  })

  it('does not call the RPC when answers array is empty after page guard', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 0, data: null },
    )
    await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(mockAuthRpc).not.toHaveBeenCalled()
  })

  it('falls back to empty string correctOptionId when RPC returns no match', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 1, data: null },
      { data: [answersData[0]] },
      { data: [questionsData[0]] },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]!.correctOptionId).toBe('')
  })

  it('handles missing question data gracefully with fallback empty values', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 1, data: null },
      { data: [answersData[0]] },
      { data: [] }, // no questions found in DB
    )
    mockAuthRpc.mockResolvedValueOnce({ data: [], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q = result.questions[0]!
    expect(q.questionText).toBe('')
    expect(q.questionNumber).toBeNull()
    expect(q.options).toEqual([])
    expect(q.correctOptionId).toBe('')
  })

  it('includes explanationImageUrl when present on the question', async () => {
    const questionsWithImage = [
      {
        ...questionsData[0],
        explanation_image_url: 'https://cdn.example.com/lift.png',
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' } },
      { count: 1, data: null },
      { data: [answersData[0]] },
      { data: questionsWithImage },
    )
    mockAuthRpc.mockResolvedValueOnce({ data: [correctOptionsData[0]], error: null })

    const result = await getAdminQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]!.explanationImageUrl).toBe('https://cdn.example.com/lift.png')
  })

  it('uses the same PAGE_SIZE as the student quiz report', () => {
    expect(PAGE_SIZE).toBe(10)
  })
})
