import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom, mockRpc, mockUpsert, mockGetDueCards, mockGetNewQuestionIds } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockFrom: vi.fn(),
    mockRpc: vi.fn(),
    mockUpsert: vi.fn(),
    mockGetDueCards: vi.fn(),
    mockGetNewQuestionIds: vi.fn(),
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

vi.mock('@/lib/queries/review', () => ({
  getDueCards: mockGetDueCards,
  getNewQuestionIds: mockGetNewQuestionIds,
}))

// ---- Subject under test ---------------------------------------------------

import { completeReviewSession, startReviewSession, submitReviewAnswer } from './actions'

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
    mockGetNewQuestionIds.mockResolvedValue([])
    const result = await startReviewSession()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('No questions available for review')
  })

  it('supplements with new questions when fewer than 10 cards are due', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const dueCards = [{ questionId: 'q1', due: '2026-03-11T00:00:00Z', state: 'review' }]
    mockGetDueCards.mockResolvedValue(dueCards) // only 1 due
    mockGetNewQuestionIds.mockResolvedValue(['q2', 'q3'])
    mockRpc.mockResolvedValue({ data: 'sess-abc', error: null })

    const result = await startReviewSession()
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questionIds).toContain('q1')
    expect(result.questionIds).toContain('q2')
    // getNewQuestionIds called with limit = 20 - 1 = 19
    expect(mockGetNewQuestionIds).toHaveBeenCalledWith(19)
  })

  it('does not fetch new questions when 10 or more due cards exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const dueCards = Array.from({ length: 10 }, (_, i) => ({
      questionId: `q${i + 1}`,
      due: '2026-03-11T00:00:00Z',
      state: 'review',
    }))
    mockGetDueCards.mockResolvedValue(dueCards)
    mockRpc.mockResolvedValue({ data: 'sess-xyz', error: null })

    await startReviewSession()
    expect(mockGetNewQuestionIds).not.toHaveBeenCalled()
  })

  it('returns failure when RPC start_quiz_session fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetDueCards.mockResolvedValue([
      { questionId: 'q1', due: '2026-03-11T00:00:00Z', state: 'review' },
    ])
    mockGetNewQuestionIds.mockResolvedValue([])
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

    const result = await startReviewSession()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('RPC error')
  })

  it('starts session with mode smart_review', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetDueCards.mockResolvedValue([
      { questionId: 'q1', due: '2026-03-11T00:00:00Z', state: 'review' },
    ])
    mockGetNewQuestionIds.mockResolvedValue([])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })

    await startReviewSession()
    // Test setup guarantees the RPC was called
    const [, rpcName, args] = mockRpc.mock.calls[0]!
    expect(rpcName).toBe('start_quiz_session')
    expect(args.p_mode).toBe('smart_review')
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
    mockFrom.mockImplementation(() => buildChain({ data: null }))
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

  it('returns failure when RPC fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'submit failed' } })

    const result = await submitReviewAnswer(validInput)
    expect(result.success).toBe(false)
  })

  it('throws ZodError when input is malformed', async () => {
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

  it('returns failure when RPC fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Could not complete' } })
    const result = await completeReviewSession(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Could not complete')
  })

  it('throws ZodError when sessionId is missing', async () => {
    await expect(completeReviewSession({})).rejects.toThrow(ZodError)
  })
})
