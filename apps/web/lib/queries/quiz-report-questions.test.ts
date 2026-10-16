import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

const { mockFetchAllRows } = vi.hoisted(() => ({ mockFetchAllRows: vi.fn() }))
// Spread the real module: Vitest THROWS on a mock that omits an export a consumer DEREFERENCES;
// this file's graph reaches supabase-paginate through fetchAllRpcRows and toPageResult.
vi.mock('@/lib/supabase-paginate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase-paginate')>()),
  fetchAllRows: mockFetchAllRows,
}))

const mockGetSessionUser = vi.fn().mockResolvedValue({ id: 'user-1' })

const mockRpc = vi.fn()

vi.mock('@/lib/auth/get-session-user', () => ({
  getSessionUser: () => mockGetSessionUser(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

import type { QuizReportQuestion } from './quiz-report'
import { PAGE_SIZE } from './quiz-report'
import { getQuizReportQuestions } from './quiz-report-questions'

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getQuizReportQuestions', () => {
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

  it('fails the report when the correct-options RPC returns a non-array payload', async () => {
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
    // A null payload is a shape violation, not an empty result: coercing it to [] would
    // render every MC question with no correct answer under a successful report.
    mockRpcByName({ correct: { data: null, error: null } })

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result).toEqual({ ok: false, error: 'Failed to load questions' })
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

  it('returns an error when the answer-keys page fetch fails after an at-cap first result', async () => {
    // get_report_answer_keys returns exactly 1000 rows on the first (unpaged) call —
    // indistinguishable from a truncated result — so fetchAllRpcRows discards it and
    // falls back to fetchAllRows (mocked at the module boundary here). That fallback
    // then fails; the failure must propagate out of getQuizReportQuestions.
    const staleKeys = Array.from({ length: 1000 }, (_, i) => ({
      question_id: `stale-${i}`,
      question_type: 'dialog_fill',
      blank_index: 0,
      answer_key: 'x',
    }))
    mockFromSequence(
      { data: { id: 'sess-1', ended_at: sessionRow.ended_at } },
      { data: answersData },
      { data: questionsData },
    )
    mockFetchAllRows.mockResolvedValueOnce({ data: orderRows, error: null }) // order-rows page
    mockRpcByName({ correct: { data: correctOptionsData }, keys: { data: staleKeys } })
    mockFetchAllRows.mockResolvedValueOnce({
      data: [],
      error: { message: 'answer keys page fetch failed' },
    }) // fetchAllRpcRows's internal paged re-fetch, triggered by the at-cap keys result

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    expect(result).toEqual({ ok: false, error: 'Failed to load questions' })
  })

  it('uses PAGE_SIZE = 10', () => {
    expect(PAGE_SIZE).toBe(10)
  })
})

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const PARALLEL_SESSION = { data: sessionRow }
const PARALLEL_ANSWERS = { data: answersData.slice(0, 1) }
const PARALLEL_QUESTIONS = { data: questionsData.slice(0, 1) }

const rpcNames = () => mockRpc.mock.calls.map((c) => c[0])
const settle = () => new Promise((r) => setTimeout(r, 10))

describe('getQuizReportQuestions parallel reads', () => {
  beforeEach(() => {
    mockFetchAllRows.mockResolvedValue({ data: [{ question_id: 'q1' }], error: null })
    mockGetSessionUser.mockResolvedValue({ id: 'user-1' })
  })

  it('starts the questions read while the answers read is still pending', async () => {
    const answers = deferred<unknown>()
    mockFromSequence(PARALLEL_SESSION, answers.promise, PARALLEL_QUESTIONS)
    mockRpc.mockResolvedValue({ data: [] })

    const result = getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    await vi.waitFor(() => expect(mockFrom.mock.calls.length).toBeGreaterThanOrEqual(2))
    await settle()
    expect(mockFrom).toHaveBeenCalledTimes(3)
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'questions')

    answers.resolve(PARALLEL_ANSWERS)
    expect((await result).ok).toBe(true)
  })

  it('starts the answer-keys RPC while the correct-options RPC is still pending', async () => {
    const correct = deferred<unknown>()
    mockFromSequence(PARALLEL_SESSION, PARALLEL_ANSWERS, PARALLEL_QUESTIONS)
    mockRpc.mockImplementation((name: string) =>
      name === 'get_report_correct_options' ? correct.promise : Promise.resolve({ data: [] }),
    )

    const result = getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })
    await vi.waitFor(() => expect(rpcNames()).toContain('get_report_correct_options'))
    await settle()
    expect(rpcNames()).toContain('get_report_answer_keys')

    correct.resolve({ data: [{ question_id: 'q1', correct_option_id: 'opt-a' }] })
    expect((await result).ok).toBe(true)
  })

  it('skips both report RPCs when the page has no answers', async () => {
    mockFromSequence(PARALLEL_SESSION, { data: [] }, PARALLEL_QUESTIONS)

    const result = await getQuizReportQuestions({ sessionId: 'sess-1', page: 1 })

    expect(result).toEqual({ ok: true, questions: [], totalCount: 1 })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
