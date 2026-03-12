import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc, mockUpdateFsrsCard, mockGetDueCards } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockUpdateFsrsCard: vi.fn(),
  mockGetDueCards: vi.fn(),
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

vi.mock('@/lib/queries/review', () => ({
  getDueCards: mockGetDueCards,
}))

// ---- Subject under test ---------------------------------------------------

import { completeReviewSession, startReviewSession, submitReviewAnswer } from './actions'

// ---- Helpers --------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockUpdateFsrsCard.mockResolvedValue(undefined)
})

// ---- startReviewSession -------------------------------------------------

describe('startReviewSession', () => {
  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await startReviewSession()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when no questions are available', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetDueCards.mockResolvedValue([])
    const result = await startReviewSession()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('No questions available for review')
  })

  it('surfaces a session-start failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetDueCards.mockResolvedValue([
      { questionId: 'q1', due: '2026-03-11T00:00:00Z', state: 'review' },
    ])
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

    const result = await startReviewSession()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start session')
  })

  it('starts session with mode smart_review', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetDueCards.mockResolvedValue([
      { questionId: 'q1', due: '2026-03-11T00:00:00Z', state: 'review' },
    ])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })

    await startReviewSession()
    // Test setup guarantees the RPC was called
    const [, rpcName, args] = mockRpc.mock.calls[0]!
    expect(rpcName).toBe('start_quiz_session')
    expect(args.p_mode).toBe('smart_review')
  })

  it('passes subjectIds to getDueCards when provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetDueCards.mockResolvedValue([
      { questionId: 'q1', due: '2026-03-11T00:00:00Z', state: 'review' },
    ])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })

    const subjectIds = ['00000000-0000-0000-0000-000000000010']
    await startReviewSession({ subjectIds })
    expect(mockGetDueCards).toHaveBeenCalledWith({ limit: 20, subjectIds })
  })

  it('returns failure when subjectIds contain invalid UUIDs', async () => {
    // Auth now runs before Zod parse; mock a valid user so the Zod guard is reached
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startReviewSession({ subjectIds: ['not-a-uuid'] })
    expect(result.success).toBe(false)
    consoleSpy.mockRestore()
  })

  it('returns failure and logs when an unexpected error is thrown', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetDueCards.mockRejectedValue(new Error('unexpected review DB failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startReviewSession()
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[startReviewSession] Uncaught error:',
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })
})

// ---- submitReviewAnswer -------------------------------------------------

describe('submitReviewAnswer', () => {
  const validInput = {
    sessionId: '00000000-0000-0000-0000-000000000001',
    questionId: '00000000-0000-0000-0000-000000000002',
    selectedOptionId: 'b',
    responseTimeMs: 5000,
  }

  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await submitReviewAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns answer result on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          is_correct: false,
          correct_option_id: 'a',
          explanation_text: 'The correct answer is A',
          explanation_image_url: null,
        },
      ],
      error: null,
    })

    const result = await submitReviewAnswer(validInput)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.isCorrect).toBe(false)
    expect(result.correctOptionId).toBe('a')
  })

  it('surfaces an answer submission failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'submit failed' } })

    const result = await submitReviewAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to submit answer')
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
    const result = await submitReviewAnswer(validInput)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.isCorrect).toBe(true)
  })

  it('rejects a malformed answer submission', async () => {
    await expect(submitReviewAnswer({})).rejects.toThrow(ZodError)
  })
})

// ---- completeReviewSession -----------------------------------------------

describe('completeReviewSession', () => {
  const validInput = { sessionId: '00000000-0000-0000-0000-000000000001' }

  it('returns score summary on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: [{ total_questions: 15, correct_count: 12, score_percentage: 80 }],
      error: null,
    })
    const result = await completeReviewSession(validInput)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.totalQuestions).toBe(15)
    expect(result.correctCount).toBe(12)
    expect(result.scorePercentage).toBe(80)
  })

  it('returns failure when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await completeReviewSession(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('surfaces a review completion failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Could not complete' } })
    const result = await completeReviewSession(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to complete session')
  })

  it('rejects a completion request without a session ID', async () => {
    await expect(completeReviewSession({})).rejects.toThrow(ZodError)
  })
})
