import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-1' } },
})

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { getQuizReport } from './quiz-report'

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
      { id: 'opt-a', text: 'Upward force', correct: true },
      { id: 'opt-b', text: 'Downward force', correct: false },
    ],
    explanation_text: 'Lift acts upward.',
  },
  {
    id: 'q2',
    question_text: 'What is drag?',
    question_number: '050-01-002',
    options: [
      { id: 'opt-c', text: 'Forward force', correct: false },
      { id: 'opt-d', text: 'Opposing force', correct: true },
    ],
    explanation_text: null,
  },
]

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getQuizReport', () => {
  it('returns null when user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await getQuizReport('sess-1')
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns full report data when session, answers, and questions exist', async () => {
    mockFromSequence({ data: sessionRow }, { data: answersData }, { data: questionsData })

    const report = await getQuizReport('sess-1')

    expect(report).not.toBeNull()
    expect(report!.sessionId).toBe('sess-1')
    expect(report!.totalQuestions).toBe(2)
    expect(report!.correctCount).toBe(1)
    expect(report!.scorePercentage).toBe(50)
    expect(report!.startedAt).toBe('2026-03-12T10:00:00Z')
    expect(report!.endedAt).toBe('2026-03-12T10:05:00Z')
    expect(report!.questions).toHaveLength(2)
  })

  it('maps question details correctly', async () => {
    mockFromSequence({ data: sessionRow }, { data: answersData }, { data: questionsData })

    const report = await getQuizReport('sess-1')
    // First answer from fixture is correct
    const q1 = report!.questions[0]!
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
    mockFromSequence({ data: sessionRow }, { data: answersData }, { data: questionsData })

    const report = await getQuizReport('sess-1')
    // Second answer from fixture is incorrect
    const q2 = report!.questions[1]!
    expect(q2.isCorrect).toBe(false)
    expect(q2.selectedOptionId).toBe('opt-c')
    expect(q2.correctOptionId).toBe('opt-d')
  })

  it('returns null when session does not exist', async () => {
    mockFromSequence({ data: null })
    const report = await getQuizReport('nonexistent')
    expect(report).toBeNull()
  })

  it('returns null when no answers exist for session', async () => {
    mockFromSequence({ data: sessionRow }, { data: [] })
    const report = await getQuizReport('sess-1')
    expect(report).toBeNull()
  })

  it('returns null when answers data is null', async () => {
    mockFromSequence({ data: sessionRow }, { data: null })
    const report = await getQuizReport('sess-1')
    expect(report).toBeNull()
  })

  it('handles missing question data gracefully', async () => {
    mockFromSequence(
      { data: sessionRow },
      { data: [answersData[0]] },
      { data: [] }, // no questions found
    )

    const report = await getQuizReport('sess-1')
    expect(report).not.toBeNull()
    // First question entry should have fallback values
    const q = report!.questions[0]!
    expect(q.questionText).toBe('')
    expect(q.questionNumber).toBeNull()
    expect(q.correctOptionId).toBe('')
    expect(q.options).toEqual([])
  })
})
