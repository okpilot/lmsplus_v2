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

import type { QuizReportQuestion } from './quiz-report'
import { PAGE_SIZE } from './quiz-report'
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

/**
 * Dispatch RPC mocks by name so both report RPCs can be stubbed independently.
 * get_report_correct_options → MC keys; get_report_answer_keys → non-MC canonicals.
 */
function mockRpcByName(map: {
  correct?: { data: unknown; error?: unknown }
  keys?: { data: unknown; error?: unknown }
}) {
  mockRpc.mockImplementation((name: string) => {
    if (name === 'get_report_correct_options') return Promise.resolve(map.correct ?? { data: [] })
    if (name === 'get_report_answer_keys') return Promise.resolve(map.keys ?? { data: [] })
    return Promise.resolve({ data: [] })
  })
}

// Narrow a union result to the MC variant for asserting MC-only fields.
function asMc(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'multiple_choice') {
    throw new Error('expected a multiple_choice report question')
  }
  return q
}

// Narrow to the dialog_fill variant.
function asDialog(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'dialog_fill') {
    throw new Error('expected a dialog_fill report question')
  }
  return q
}

// ---- Fixtures -------------------------------------------------------------

const sessionRow = {
  id: 'sess-1',
  mode: 'quick_quiz',
  ended_at: '2026-03-12T10:05:00Z',
}

// Two distinct answered questions, in answered order.
const orderRows = [{ question_id: 'q1' }, { question_id: 'q2' }]

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
    question_type: 'multiple_choice',
    options: [
      { id: 'opt-a', text: 'Upward force' },
      { id: 'opt-b', text: 'Downward force' },
    ],
    explanation_text: 'Lift acts upward.',
    question_image_url: null,
  },
  {
    id: 'q2',
    question_text: 'What is drag?',
    question_number: '050-01-002',
    question_type: 'multiple_choice',
    options: [
      { id: 'opt-c', text: 'Forward force' },
      { id: 'opt-d', text: 'Opposing force' },
    ],
    explanation_text: null,
    question_image_url: null,
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

  it('returns one entry per answered question with a distinct-question total', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: answersData },
      { data: questionsData },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: orderRows, error: null })
    mockRpcByName({ correct: { data: correctOptionsData } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(2)
    expect(result.totalCount).toBe(2)
  })

  it('maps question details correctly', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: answersData },
      { data: questionsData },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: orderRows, error: null })
    mockRpcByName({ correct: { data: correctOptionsData } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q1 = asMc(result.questions[0])
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
      { data: answersData },
      { data: questionsData },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: orderRows, error: null })
    mockRpcByName({ correct: { data: correctOptionsData } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q2 = asMc(result.questions[1])
    expect(q2.isCorrect).toBe(false)
    expect(q2.selectedOptionId).toBe('opt-c')
    expect(q2.correctOptionId).toBe('opt-d')
  })

  it('returns ok:true with empty questions array when no answers on page', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } })
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: null })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })

  it('returns error when the question-order query fails', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } })
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: { message: 'db error' } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when correct-options RPC returns an error', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: answersData },
      { data: questionsData },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: orderRows, error: null })
    mockRpcByName({ correct: { data: null, error: { message: 'rpc failed' } } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('returns error when the answer-keys RPC returns an error', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: answersData },
      { data: questionsData },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: orderRows, error: null })
    mockRpcByName({
      correct: { data: correctOptionsData },
      keys: { data: null, error: { message: 'keys rpc failed' } },
    })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(false)
  })

  it('does not call either report RPC when no questions were answered', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } })
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: null })
    await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls both report RPCs with the session id', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: answersData },
      { data: questionsData },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: orderRows, error: null })
    mockRpcByName({ correct: { data: correctOptionsData } })

    await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })

    expect(mockRpc).toHaveBeenCalledWith('get_report_correct_options', {
      p_session_id: 'sess-1',
    })
    expect(mockRpc).toHaveBeenCalledWith('get_report_answer_keys', {
      p_session_id: 'sess-1',
    })
  })

  it('falls back to empty correctOptionId when RPC returns no match', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: [answersData[0]] },
      {
        data: [
          {
            id: 'q1',
            question_text: 'What is lift?',
            question_number: '050-01-001',
            question_type: 'multiple_choice',
            options: [{ id: 'opt-a', text: 'Upward force' }],
            explanation_text: null,
          },
        ],
      },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: [{ question_id: 'q1' }], error: null })
    mockRpcByName({ correct: { data: [] } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(asMc(result.questions[0]).correctOptionId).toBe('')
  })

  it('handles missing question data gracefully with fallback values', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: [answersData[0]] },
      { data: [] }, // no questions found
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: [{ question_id: 'q1' }], error: null })
    mockRpcByName({ correct: { data: [] } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const q = asMc(result.questions[0])
    expect(q.questionText).toBe('')
    expect(q.questionNumber).toBeNull()
    expect(q.correctOptionId).toBe('')
    expect(q.options).toEqual([])
  })

  it('passes response time through to the result', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: answersData },
      { data: questionsData },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: orderRows, error: null })
    mockRpcByName({ correct: { data: correctOptionsData } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]?.responseTimeMs).toBe(3000)
    expect(result.questions[1]?.responseTimeMs).toBe(5000)
  })

  it('strips the correct field from options so it is never exposed in the result', async () => {
    const questionsWithCorrectField = [
      {
        id: 'q1',
        question_text: 'What is lift?',
        question_number: '050-01-001',
        question_type: 'multiple_choice',
        options: [
          { id: 'opt-a', text: 'Upward force', correct: true },
          { id: 'opt-b', text: 'Downward force', correct: false },
        ],
        explanation_text: null,
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: [answersData[0]] },
      { data: questionsWithCorrectField },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: [{ question_id: 'q1' }], error: null })
    mockRpcByName({ correct: { data: [correctOptionsData[0]] } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const options = asMc(result.questions[0]).options
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
        question_type: 'multiple_choice',
        options: [{ id: 'opt-a', text: 'Upward force' }],
        explanation_text: 'Lift is perpendicular to relative wind.',
        explanation_image_url: 'https://cdn.example.com/lift-diagram.png',
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: [answersData[0]] },
      { data: questionsWithImage },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: [{ question_id: 'q1' }], error: null })
    mockRpcByName({ correct: { data: [correctOptionsData[0]] } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]?.explanationImageUrl).toBe(
      'https://cdn.example.com/lift-diagram.png',
    )
  })

  it('sets explanationImageUrl to null when explanation_image_url is null on the question row', async () => {
    const questionsNoImage = [
      {
        id: 'q1',
        question_text: 'What is lift?',
        question_number: '050-01-001',
        question_type: 'multiple_choice',
        options: [{ id: 'opt-a', text: 'Upward force' }],
        explanation_text: 'Some explanation',
        explanation_image_url: null,
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: [answersData[0]] },
      { data: questionsNoImage },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: [{ question_id: 'q1' }], error: null })
    mockRpcByName({ correct: { data: [correctOptionsData[0]] } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions[0]?.explanationImageUrl).toBeNull()
  })

  it('returns empty questions with the distinct-question total when page exceeds total pages', async () => {
    const fiveQuestions = Array.from({ length: 5 }, (_, i) => ({ question_id: `q${i + 1}` }))
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } })
    mockFetchAllRows.mockResolvedValueOnce({ data: fiveQuestions, error: null })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 99 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(5)
  })

  it('returns empty questions with the total when page is zero', async () => {
    const fiveQuestions = Array.from({ length: 5 }, (_, i) => ({ question_id: `q${i + 1}` }))
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } })
    mockFetchAllRows.mockResolvedValueOnce({ data: fiveQuestions, error: null })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(5)
  })

  it('returns empty questions with the total when page is negative', async () => {
    const fiveQuestions = Array.from({ length: 5 }, (_, i) => ({ question_id: `q${i + 1}` }))
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } })
    mockFetchAllRows.mockResolvedValueOnce({ data: fiveQuestions, error: null })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: -5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questions).toHaveLength(0)
    expect(result.totalCount).toBe(5)
  })

  it('treats all correctOptionIds as empty string when RPC returns null instead of an array', async () => {
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: [answersData[0]] },
      {
        data: [
          {
            id: 'q1',
            question_text: 'What is lift?',
            question_number: '050-01-001',
            question_type: 'multiple_choice',
            options: [{ id: 'opt-a', text: 'Upward force' }],
            explanation_text: null,
            explanation_image_url: null,
          },
        ],
      },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: [{ question_id: 'q1' }], error: null })
    // RPC returns null (non-array) — the Array.isArray guard must treat this as []
    mockRpcByName({ correct: { data: null, error: null } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(asMc(result.questions[0]).correctOptionId).toBe('')
  })

  it('collapses a multi-blank dialog question into one entry and counts it once toward the total', async () => {
    // Mixed: one MC (q1) + one 3-blank dialog_fill (q2). The dialog's 3 answer
    // rows must collapse to ONE report entry, and totalCount must count distinct
    // questions (2), not rows (4).
    const mixedOrderRows = [{ question_id: 'q1' }, { question_id: 'q2' }]
    const mixedAnswers = [
      {
        question_id: 'q1',
        selected_option_id: 'opt-a',
        is_correct: true,
        response_time_ms: 3000,
      },
      {
        question_id: 'q2',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 4000,
        response_text: 'cleared',
        blank_index: 0,
      },
      {
        question_id: 'q2',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 4000,
        response_text: 'wrong',
        blank_index: 1,
      },
      {
        question_id: 'q2',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 4000,
        response_text: 'roger',
        blank_index: 2,
      },
    ]
    const mixedQuestions = [
      {
        id: 'q1',
        question_text: 'What is lift?',
        question_number: '050-01-001',
        question_type: 'multiple_choice',
        options: [{ id: 'opt-a', text: 'Upward force' }],
        explanation_text: null,
      },
      {
        id: 'q2',
        question_text: 'Fill the readback',
        question_number: '092-02-001',
        question_type: 'dialog_fill',
        options: [],
        explanation_text: null,
      },
    ]
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: mixedAnswers },
      { data: mixedQuestions },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: mixedOrderRows, error: null })
    mockRpcByName({
      correct: { data: [{ question_id: 'q1', correct_option_id: 'opt-a' }] },
      keys: {
        data: [
          {
            question_id: 'q2',
            question_type: 'dialog_fill',
            blank_index: 0,
            answer_key: 'cleared',
          },
          { question_id: 'q2', question_type: 'dialog_fill', blank_index: 1, answer_key: 'climb' },
          { question_id: 'q2', question_type: 'dialog_fill', blank_index: 2, answer_key: 'roger' },
        ],
      },
    })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 2 distinct questions, not 4 answer rows.
    expect(result.questions).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    const dialog = asDialog(result.questions[1])
    expect(dialog.blanks).toHaveLength(3)
    expect(dialog.correctCount).toBe(2)
    expect(dialog.totalBlanks).toBe(3)
    expect(dialog.isCorrect).toBe(false)
    // Per-blank canonical surfaces for the wrong blank.
    expect(dialog.blanks[1]?.canonical).toBe('climb')
  })

  it('returns an error when the order-rows page fetch fails', async () => {
    mockFromSequence({ data: { id: 'sess-1', ended_at: sessionRow.ended_at } })
    mockFetchAllRows.mockResolvedValueOnce({
      data: [],
      error: { message: 'page-level DB timeout' },
    })
    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result).toEqual({ ok: false, error: 'Failed to load questions' })
  })

  it('uses PAGE_SIZE = 10', () => {
    expect(PAGE_SIZE).toBe(10)
  })
})
