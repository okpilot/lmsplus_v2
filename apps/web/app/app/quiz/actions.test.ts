import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc, mockUpdateFsrsCard, mockGetRandomQuestionIds } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockUpdateFsrsCard: vi.fn(),
  mockGetRandomQuestionIds: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
}))

vi.mock('@/lib/fsrs/update-card', () => ({
  updateFsrsCard: mockUpdateFsrsCard,
}))

vi.mock('@/lib/queries/quiz', () => ({
  getRandomQuestionIds: mockGetRandomQuestionIds,
}))

// ---- Subject under test ---------------------------------------------------

import { completeQuiz, startQuizSession, submitQuizAnswer } from './actions'

// ---- Helpers --------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockUpdateFsrsCard.mockResolvedValue(undefined)
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

  it('surfaces a session-start failure', async () => {
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
    expect(result.error).toBe('Failed to start session')
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

  it('returns failure for an invalid quiz configuration', async () => {
    const result = await startQuizSession({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('Required')
  })

  it('returns failure for a non-UUID subject ID', async () => {
    const result = await startQuizSession({ subjectId: 'not-a-uuid', topicId: null, count: 5 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('Invalid uuid')
  })

  it('returns failure and logs when an unexpected error is thrown', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockRejectedValue(new Error('unexpected DB failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startQuizSession({
      subjectId: '00000000-0000-0000-0000-000000000001',
      topicId: null,
      count: 5,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
    expect(consoleSpy).toHaveBeenCalledWith('[startQuizSession] Uncaught error:', expect.any(Error))
    consoleSpy.mockRestore()
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

  it('surfaces an answer submission failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Answer not valid' } })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to submit answer')
  })

  it('treats empty answer data as a failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
  })

  it('returns correctness and explanation after a valid answer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
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

  it('calls updateFsrsCard after a correct answer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
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
    expect(mockUpdateFsrsCard).toHaveBeenCalledOnce()
  })

  it('still returns success when FSRS update throws (non-fatal)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpdateFsrsCard.mockRejectedValue(new Error('DB connection lost'))
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
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.isCorrect).toBe(true)
  })

  it('rejects a malformed answer submission', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    await expect(submitQuizAnswer({})).rejects.toThrow(ZodError)
  })
})

// ---- completeQuiz --------------------------------------------------------

describe('completeQuiz', () => {
  const validInput = { sessionId: '00000000-0000-0000-0000-000000000001' }

  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('surfaces a quiz completion failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Session not found' } })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to complete session')
  })

  it('treats empty completion data as a failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(false)
  })

  it('returns the score summary after completing a quiz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
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

  it('rejects a completion request without a session ID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    await expect(completeQuiz({})).rejects.toThrow(ZodError)
  })
})
