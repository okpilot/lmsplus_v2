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

import { getQuizReportSummary, PAGE_SIZE } from './quiz-report'
import { getQuizReportQuestions } from './quiz-report-questions'

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

const answersData = [
  {
    question_id: 'q1',
    selected_option_id: 'opt-a',
    is_correct: true,
    response_time_ms: 3000,
  },
  {
    question_id: 'q2',
    selected_option_id: 'opt-c',
    is_correct: false,
    response_time_ms: 5000,
  },
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
  },
]

const correctOptionsData = [
  { question_id: 'q1', correct_option_id: 'opt-a' },
  { question_id: 'q2', correct_option_id: 'opt-d' },
]

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

// ---------------------------------------------------------------------------
// getQuizReportQuestions
// ---------------------------------------------------------------------------

describe('getQuizReportQuestions', () => {
  it('returns error when user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns error when auth returns an error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'token expired' },
    })
    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when session does not exist', async () => {
    mockFromSequence({ data: null })
    const result = await getQuizReportQuestions({ sessionId: 'nonexistent', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when session is still active to prevent mid-session answer exposure', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: null } })
    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('does not query answers or questions when session is active', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: null } })
    await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    // Only the session query should have fired
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('returns paginated questions with totalCount', async () => {
    // session row, count query, answers, questions
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 2 },
      { data: answersData },
      { data: questionsData },
    )
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(2)
    expect(result.totalCount).toBe(2)
  })

  it('maps question details correctly', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 2 },
      { data: answersData },
      { data: questionsData },
    )
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q1 = result.questions[0]!
    expect(q1.questionId).toBe('q1')
    expect(q1.questionText).toBe('What is lift?')
    expect(q1.isCorrect).toBe(true)
    expect(q1.selectedOptionId).toBe('opt-a')
    expect(q1.correctOptionId).toBe('opt-a')
    expect(q1.explanationText).toBe('Lift acts upward.')
    expect(q1.options).toHaveLength(2)
    // Options should not include `correct` field
    expect(q1.options[0]).toEqual({ id: 'opt-a', text: 'Upward force' })
  })

  it('identifies incorrect answers and correct option', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 2 },
      { data: answersData },
      { data: questionsData },
    )
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q2 = result.questions[1]!
    expect(q2.isCorrect).toBe(false)
    expect(q2.selectedOptionId).toBe('opt-c')
    expect(q2.correctOptionId).toBe('opt-d')
  })

  it('returns ok:true with empty questions array when no answers on page', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } }, { count: 0 })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })

  it('returns error when count query fails', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: null, error: { message: 'db error' } },
    )

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when correct-options RPC returns an error', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 2 },
      { data: answersData },
      { data: questionsData },
    )
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('does not call the correct-options RPC when answers array is empty', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } }, { count: 0 })
    await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('forwards sessionId as p_session_id when calling the correct-options RPC', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 2 },
      { data: answersData },
      { data: questionsData },
    )
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })

    expect(mockRpc).toHaveBeenCalledWith('get_report_correct_options', {
      p_session_id: 'sess-1',
    })
  })

  it('falls back to empty correctOptionId when RPC returns no match', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 1 },
      { data: [answersData[0]] },
      {
        data: [
          {
            id: 'q1',
            question_text: 'What is lift?',
            question_number: '050-01-001',
            options: [{ id: 'opt-a', text: 'Upward force' }],
            explanation_text: null,
          },
        ],
      },
    )
    mockRpc.mockResolvedValueOnce({ data: [] })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]!.correctOptionId).toBe('')
  })

  it('handles missing question data gracefully with fallback values', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 1 },
      { data: [answersData[0]] },
      { data: [] }, // no questions found
    )
    mockRpc.mockResolvedValueOnce({ data: [] })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q = result.questions[0]!
    expect(q.questionText).toBe('')
    expect(q.questionNumber).toBeNull()
    expect(q.correctOptionId).toBe('')
    expect(q.options).toEqual([])
  })

  it('passes response time through to the result', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 2 },
      { data: answersData },
      { data: questionsData },
    )
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]!.responseTimeMs).toBe(3000)
    expect(result.questions[1]!.responseTimeMs).toBe(5000)
  })

  it('strips the correct field from options so it is never exposed in the result', async () => {
    const questionsWithCorrectField = [
      {
        id: 'q1',
        question_text: 'What is lift?',
        question_number: '050-01-001',
        options: [
          { id: 'opt-a', text: 'Upward force', correct: true },
          { id: 'opt-b', text: 'Downward force', correct: false },
        ],
        explanation_text: null,
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 1 },
      { data: [answersData[0]] },
      { data: questionsWithCorrectField },
    )
    mockRpc.mockResolvedValueOnce({ data: [correctOptionsData[0]] })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const options = result.questions[0]!.options
    expect(options).toHaveLength(2)
    expect(options[0]).toEqual({ id: 'opt-a', text: 'Upward force' })
    expect(options[1]).toEqual({ id: 'opt-b', text: 'Downward force' })
    expect(options[0]).not.toHaveProperty('correct')
    expect(options[1]).not.toHaveProperty('correct')
  })

  it('maps explanationImageUrl when present on the question row', async () => {
    const questionsWithImage = [
      {
        id: 'q1',
        question_text: 'What is lift?',
        question_number: '050-01-001',
        options: [{ id: 'opt-a', text: 'Upward force' }],
        explanation_text: 'Lift is perpendicular to relative wind.',
        explanation_image_url: 'https://cdn.example.com/lift-diagram.png',
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 1 },
      { data: [answersData[0]] },
      { data: questionsWithImage },
    )
    mockRpc.mockResolvedValueOnce({ data: [correctOptionsData[0]] })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]!.explanationImageUrl).toBe(
      'https://cdn.example.com/lift-diagram.png',
    )
  })

  it('sets explanationImageUrl to null when explanation_image_url is null on the question row', async () => {
    const questionsNoImage = [
      {
        id: 'q1',
        question_text: 'What is lift?',
        question_number: '050-01-001',
        options: [{ id: 'opt-a', text: 'Upward force' }],
        explanation_text: 'Some explanation',
        explanation_image_url: null,
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 1 },
      { data: [answersData[0]] },
      { data: questionsNoImage },
    )
    mockRpc.mockResolvedValueOnce({ data: [correctOptionsData[0]] })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]!.explanationImageUrl).toBeNull()
  })

  it('returns empty questions with correct totalCount when page exceeds total pages', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } }, { count: 5 })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 99 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(5)
  })

  it('treats all correctOptionIds as empty string when RPC returns null instead of an array', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { count: 1 },
      { data: [answersData[0]] },
      {
        data: [
          {
            id: 'q1',
            question_text: 'What is lift?',
            question_number: '050-01-001',
            options: [{ id: 'opt-a', text: 'Upward force' }],
            explanation_text: null,
            explanation_image_url: null,
          },
        ],
      },
    )
    // RPC returns null (non-array) — the Array.isArray guard must treat this as []
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]!.correctOptionId).toBe('')
  })

  it('uses PAGE_SIZE = 10', () => {
    expect(PAGE_SIZE).toBe(10)
  })
})
