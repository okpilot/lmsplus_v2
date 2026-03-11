import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom, mockRpc, mockUpsert, mockGetRandomQuestionIds } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockUpsert: vi.fn(),
  mockGetRandomQuestionIds: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
  upsert: mockUpsert,
}))

vi.mock('@/lib/queries/quiz', () => ({
  getRandomQuestionIds: mockGetRandomQuestionIds,
}))

// ---- Subject under test ---------------------------------------------------

import { completeQuiz, startQuizSession, submitQuizAnswer } from './actions'

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

beforeEach(() => {
  vi.clearAllMocks()
  mockUpsert.mockResolvedValue(undefined)
})

// ---- startQuizSession ----------------------------------------------------

describe('startQuizSession', () => {
  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-0000-0000-000000000001',
      topicId: null,
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when no questions are available', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue([])
    const result = await startQuizSession({
      subjectId: '00000000-0000-0000-0000-000000000001',
      topicId: null,
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('No questions available for this selection')
  })

  it('returns failure when RPC start_quiz_session returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1', 'q2'])
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-0000-0000-000000000001',
      topicId: null,
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('DB error')
  })

  it('returns success with sessionId and questionIds on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1', 'q2', 'q3'])
    mockRpc.mockResolvedValue({ data: 'session-123', error: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-0000-0000-000000000001',
      topicId: null,
      count: 3,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sessionId).toBe('session-123')
    expect(result.questionIds).toEqual(['q1', 'q2', 'q3'])
  })

  it('throws ZodError when input is invalid (missing required fields)', async () => {
    await expect(startQuizSession({})).rejects.toThrow()
  })

  it('throws ZodError when subjectId is not a UUID', async () => {
    await expect(
      startQuizSession({ subjectId: 'not-a-uuid', topicId: null, count: 5 }),
    ).rejects.toThrow()
  })
})

// ---- submitQuizAnswer ----------------------------------------------------

describe('submitQuizAnswer', () => {
  const validInput = {
    sessionId: '00000000-0000-0000-0000-000000000001',
    questionId: '00000000-0000-0000-0000-000000000002',
    selectedOptionId: 'a',
    responseTimeMs: 3000,
  }

  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when RPC submit_quiz_answer returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Answer not valid' } })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Answer not valid')
  })

  it('returns failure when RPC returns empty data array', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
  })

  it('returns answer result with correctness and explanation on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation(() => buildChain({ data: null }))
    mockRpc.mockResolvedValue({
      data: [
        {
          is_correct: true,
          correct_option_id: 'a',
          explanation_text: 'Because reasons',
          explanation_image_url: null,
        },
      ],
      error: null,
    })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.isCorrect).toBe(true)
    expect(result.correctOptionId).toBe('a')
    expect(result.explanationText).toBe('Because reasons')
    expect(result.explanationImageUrl).toBeNull()
  })

  it('updates the FSRS card after a correct answer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // FSRS card lookup — maybeSingle needs chaining
    mockFrom.mockImplementation(() => buildChain({ data: null }))
    mockRpc.mockResolvedValue({
      data: [
        {
          is_correct: true,
          correct_option_id: 'a',
          explanation_text: null,
          explanation_image_url: null,
        },
      ],
      error: null,
    })
    await submitQuizAnswer(validInput)
    expect(mockUpsert).toHaveBeenCalledOnce()
    const [, table] = mockUpsert.mock.calls[0]
    expect(table).toBe('fsrs_cards')
  })
})

// ---- completeQuiz --------------------------------------------------------

describe('completeQuiz', () => {
  const validInput = { sessionId: '00000000-0000-0000-0000-000000000001' }

  it('returns failure when RPC complete_quiz_session returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Session not found' } })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Session not found')
  })

  it('returns failure when RPC returns empty data', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(false)
  })

  it('returns score summary on happy path', async () => {
    mockRpc.mockResolvedValue({
      data: [{ total_questions: 10, correct_count: 7, score_percentage: 70 }],
      error: null,
    })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.totalQuestions).toBe(10)
    expect(result.correctCount).toBe(7)
    expect(result.scorePercentage).toBe(70)
  })

  it('throws ZodError when sessionId is missing', async () => {
    await expect(completeQuiz({})).rejects.toThrow()
  })
})
