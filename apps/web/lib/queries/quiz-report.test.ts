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

describe('getQuizReport', () => {
  it('returns null when user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await getQuizReport('sess-1')
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns null when auth returns an error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'token expired' },
    })
    const result = await getQuizReport('sess-1')
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns full report data when session, answers, and questions exist', async () => {
    mockFromSequence({ data: sessionRow }, { data: answersData }, { data: questionsData })
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    const report = await getQuizReport('sess-1')

    expect(report).not.toBeNull()
    expect(report!.sessionId).toBe('sess-1')
    expect(report!.mode).toBe('quick_quiz')
    expect(report!.subjectName).toBeNull()
    expect(report!.totalQuestions).toBe(2)
    expect(report!.correctCount).toBe(1)
    expect(report!.scorePercentage).toBe(50)
    expect(report!.startedAt).toBe('2026-03-12T10:00:00Z')
    expect(report!.endedAt).toBe('2026-03-12T10:05:00Z')
    expect(report!.questions).toHaveLength(2)
  })

  it('resolves subject name when subject_id is present', async () => {
    const sessionWithSubject = { ...sessionRow, subject_id: 'sub-1' }
    mockFromSequence(
      { data: sessionWithSubject },
      { data: { name: 'Meteorology' } },
      { data: answersData },
      { data: questionsData },
    )
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    const report = await getQuizReport('sess-1')
    expect(report!.subjectName).toBe('Meteorology')
  })

  it('falls back to null subjectName when subject lookup fails', async () => {
    const sessionWithSubject = { ...sessionRow, subject_id: 'sub-1' }
    mockFromSequence(
      { data: sessionWithSubject },
      { data: null, error: { message: 'relation not found' } },
      { data: answersData },
      { data: questionsData },
    )
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    const report = await getQuizReport('sess-1')
    expect(report).not.toBeNull()
    expect(report!.subjectName).toBeNull()
  })

  it('maps question details correctly', async () => {
    mockFromSequence({ data: sessionRow }, { data: answersData }, { data: questionsData })
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

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
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    const report = await getQuizReport('sess-1')
    // Second answer from fixture is incorrect
    const q2 = report!.questions[1]!
    expect(q2.isCorrect).toBe(false)
    expect(q2.selectedOptionId).toBe('opt-c')
    expect(q2.correctOptionId).toBe('opt-d')
  })

  it('returns null when session is still active to prevent mid-session answer exposure', async () => {
    const activeSession = { ...sessionRow, ended_at: null }
    mockFromSequence({ data: activeSession })
    const report = await getQuizReport('sess-1')
    expect(report).toBeNull()
  })

  it('does not query answers or questions when session is active', async () => {
    const activeSession = { ...sessionRow, ended_at: null }
    mockFromSequence({ data: activeSession })
    await getQuizReport('sess-1')
    // Only the session query should have fired — no downstream DB calls
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('falls back to empty correctOptionId when RPC returns no match', async () => {
    const noCorrectQuestions = [
      {
        id: 'q1',
        question_text: 'What is lift?',
        question_number: '050-01-001',
        options: [
          { id: 'opt-a', text: 'Upward force' },
          { id: 'opt-b', text: 'Downward force' },
        ],
        explanation_text: null,
      },
    ]
    mockFromSequence({ data: sessionRow }, { data: [answersData[0]] }, { data: noCorrectQuestions })
    mockRpc.mockResolvedValueOnce({ data: [] })
    const report = await getQuizReport('sess-1')
    expect(report).not.toBeNull()
    expect(report!.questions[0]!.correctOptionId).toBe('')
  })

  it('handles null questions response from DB with fallback values', async () => {
    mockFromSequence({ data: sessionRow }, { data: [answersData[0]] }, { data: null })
    mockRpc.mockResolvedValueOnce({ data: null })
    const report = await getQuizReport('sess-1')
    expect(report).not.toBeNull()
    const q = report!.questions[0]!
    expect(q.questionText).toBe('')
    expect(q.questionNumber).toBeNull()
    expect(q.correctOptionId).toBe('')
    expect(q.options).toEqual([])
    expect(q.explanationText).toBeNull()
  })

  it('passes response time through to the report', async () => {
    mockFromSequence({ data: sessionRow }, { data: answersData }, { data: questionsData })
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })
    const report = await getQuizReport('sess-1')
    expect(report!.questions[0]!.responseTimeMs).toBe(3000)
    expect(report!.questions[1]!.responseTimeMs).toBe(5000)
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
    mockRpc.mockResolvedValueOnce({ data: [] })

    const report = await getQuizReport('sess-1')
    expect(report).not.toBeNull()
    // First question entry should have fallback values
    const q = report!.questions[0]!
    expect(q.questionText).toBe('')
    expect(q.questionNumber).toBeNull()
    expect(q.correctOptionId).toBe('')
    expect(q.options).toEqual([])
  })

  it('falls back to zero scorePercentage when session score_percentage is null', async () => {
    const sessionWithNullScore = { ...sessionRow, score_percentage: null }
    mockFromSequence({ data: sessionWithNullScore }, { data: answersData }, { data: questionsData })
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    const report = await getQuizReport('sess-1')
    expect(report).not.toBeNull()
    expect(report!.scorePercentage).toBe(0)
  })

  it('returns null when correct-options RPC returns an error', async () => {
    mockFromSequence({ data: sessionRow }, { data: answersData }, { data: questionsData })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })

    const report = await getQuizReport('sess-1')
    expect(report).toBeNull()
  })

  it('does not call the correct-options RPC when answers array is empty', async () => {
    mockFromSequence({ data: sessionRow }, { data: [] })
    await getQuizReport('sess-1')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('forwards sessionId as p_session_id when calling the correct-options RPC', async () => {
    mockFromSequence({ data: sessionRow }, { data: answersData }, { data: questionsData })
    mockRpc.mockResolvedValueOnce({ data: correctOptionsData })

    await getQuizReport('sess-1')

    expect(mockRpc).toHaveBeenCalledWith('get_report_correct_options', {
      p_session_id: 'sess-1',
    })
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
    mockFromSequence({ data: sessionRow }, { data: [answersData[0]] }, { data: questionsWithImage })
    mockRpc.mockResolvedValueOnce({ data: [correctOptionsData[0]] })

    const report = await getQuizReport('sess-1')
    expect(report!.questions[0]!.explanationImageUrl).toBe(
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
    mockFromSequence({ data: sessionRow }, { data: [answersData[0]] }, { data: questionsNoImage })
    mockRpc.mockResolvedValueOnce({ data: [correctOptionsData[0]] })

    const report = await getQuizReport('sess-1')
    expect(report!.questions[0]!.explanationImageUrl).toBeNull()
  })

  it('sets explanationImageUrl to null when question is missing from the questions result', async () => {
    mockFromSequence({ data: sessionRow }, { data: [answersData[0]] }, { data: [] })
    mockRpc.mockResolvedValueOnce({ data: [] })

    const report = await getQuizReport('sess-1')
    expect(report!.questions[0]!.explanationImageUrl).toBeNull()
  })

  it('strips the correct field from options so it is never exposed in the report', async () => {
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
      { data: sessionRow },
      { data: [answersData[0]] },
      { data: questionsWithCorrectField },
    )
    mockRpc.mockResolvedValueOnce({ data: [correctOptionsData[0]] })

    const report = await getQuizReport('sess-1')
    const options = report!.questions[0]!.options

    expect(options).toHaveLength(2)
    expect(options[0]).toEqual({ id: 'opt-a', text: 'Upward force' })
    expect(options[1]).toEqual({ id: 'opt-b', text: 'Downward force' })
    // Ensure correct field is absent — not just falsy
    expect(options[0]).not.toHaveProperty('correct')
    expect(options[1]).not.toHaveProperty('correct')
  })
})
