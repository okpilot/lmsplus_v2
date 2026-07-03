import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
}))

// ---- Subject under test ---------------------------------------------------

import { batchSubmitQuiz } from './batch-submit'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'

const VALID_ANSWERS = [
  { questionId: Q1_ID, selectedOptionId: 'a', responseTimeMs: 2000 },
  { questionId: Q2_ID, selectedOptionId: 'b', responseTimeMs: 3500 },
]

const BATCH_RPC_RESULT = {
  results: [
    {
      question_id: Q1_ID,
      is_correct: true,
      correct_option_id: 'a',
      explanation_text: 'Some explanation',
      explanation_image_url: null,
    },
    {
      question_id: Q2_ID,
      is_correct: false,
      correct_option_id: 'c',
      explanation_text: 'Another explanation',
      explanation_image_url: null,
    },
  ],
  total_questions: 2,
  answered_count: 2,
  correct_count: 1,
  score_percentage: 50,
}

// ---- Helpers --------------------------------------------------------------

function mockSuccessfulRun() {
  mockRpc.mockResolvedValueOnce({ data: BATCH_RPC_RESULT, error: null })
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- batchSubmitQuiz ------------------------------------------------------

describe('batchSubmitQuiz', () => {
  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when authentication fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'token refresh failed' },
    })
    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when valid input is given but user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when answers array is empty (Zod min(1))', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: [] })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when sessionId is not a valid UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await batchSubmitQuiz({ sessionId: 'not-a-uuid', answers: VALID_ANSWERS })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when an answer questionId is not a valid UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await batchSubmitQuiz({
      sessionId: SESSION_ID,
      answers: [{ questionId: 'bad-id', selectedOptionId: 'a', responseTimeMs: 1000 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when an answer has an empty selectedOptionId string', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await batchSubmitQuiz({
      sessionId: SESSION_ID,
      answers: [{ questionId: Q1_ID, selectedOptionId: '', responseTimeMs: 1000 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when an answer has a whitespace-only selectedOptionId string', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await batchSubmitQuiz({
      sessionId: SESSION_ID,
      answers: [{ questionId: Q1_ID, selectedOptionId: '   ', responseTimeMs: 1000 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when responseTimeMs is not a positive integer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await batchSubmitQuiz({
      sessionId: SESSION_ID,
      answers: [{ questionId: Q1_ID, selectedOptionId: 'a', responseTimeMs: -100 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns success with score data on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSuccessfulRun()

    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.totalQuestions).toBe(2)
    expect(result.answeredCount).toBe(2)
    expect(result.correctCount).toBe(1)
    expect(result.scorePercentage).toBe(50)
  })

  it('includes per-question results on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSuccessfulRun()

    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toMatchObject({
      questionId: Q1_ID,
      isCorrect: true,
      correctOptionId: 'a',
      explanationText: 'Some explanation',
      explanationImageUrl: null,
    })
  })

  it('calls single batch RPC instead of per-answer RPCs', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSuccessfulRun()

    await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'batch_submit_quiz',
      expect.objectContaining({ p_session_id: SESSION_ID }),
    )
  })

  it('returns failure when batch RPC returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'session not found' } })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })
    consoleSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Failed to submit quiz/)
  })

  it('returns "session could not be found" when RPC signals session not accessible', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'session not found or not accessible' },
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })
    consoleSpy.mockRestore()

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('This session could not be found.')
  })

  it('returns generic failure and logs when an unexpected error is thrown', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockRejectedValue(new Error('connection reset'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/Something went wrong/)
    expect(consoleSpy).toHaveBeenCalledWith('[batchSubmitQuiz] Uncaught error:', expect.any(String))
    consoleSpy.mockRestore()
  })

  it('returns expired as false on the normal (non-expired) grade path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // RPC returns no `expired` field — the action must default it to false
    mockRpc.mockResolvedValueOnce({ data: BATCH_RPC_RESULT, error: null })

    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.expired).toBe(false)
  })

  it('surfaces expired as true when the RPC signals timer-expiry on replay', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValueOnce({
      data: { ...BATCH_RPC_RESULT, expired: true },
      error: null,
    })

    const result = await batchSubmitQuiz({ sessionId: SESSION_ID, answers: VALID_ANSWERS })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.expired).toBe(true)
  })

  it('serialises a short_answer entry to {question_id, response_text, response_time_ms}', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValueOnce({ data: BATCH_RPC_RESULT, error: null })

    await batchSubmitQuiz({
      sessionId: SESSION_ID,
      answers: [{ questionId: Q1_ID, responseText: 'Paris', responseTimeMs: 1500 }],
    })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'batch_submit_quiz',
      expect.objectContaining({
        p_answers: [
          {
            question_id: Q1_ID,
            selected_option: undefined,
            response_text: 'Paris',
            blank_index: undefined,
            response_time_ms: 1500,
          },
        ],
      }),
    )
  })

  it('serialises a dialog_fill answer with 2 blanks to 2 entries each with blank_index and response_text', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValueOnce({ data: BATCH_RPC_RESULT, error: null })

    await batchSubmitQuiz({
      sessionId: SESSION_ID,
      answers: [
        { questionId: Q1_ID, blankIndex: 0, responseText: 'north', responseTimeMs: 2000 },
        { questionId: Q1_ID, blankIndex: 1, responseText: 'south', responseTimeMs: 2000 },
      ],
    })

    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'batch_submit_quiz',
      expect.objectContaining({
        p_answers: [
          {
            question_id: Q1_ID,
            selected_option: undefined,
            response_text: 'north',
            blank_index: 0,
            response_time_ms: 2000,
          },
          {
            question_id: Q1_ID,
            selected_option: undefined,
            response_text: 'south',
            blank_index: 1,
            response_time_ms: 2000,
          },
        ],
      }),
    )
  })
})
