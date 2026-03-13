import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { checkAnswer } from './check-answer'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-0000-0000-000000000001'
const QUESTION_ID = '00000000-0000-0000-0000-000000000011'
const SESSION_ID = '00000000-0000-0000-0000-000000000099'
const CORRECT_OPTION_ID = 'opt-correct'
const WRONG_OPTION_ID = 'opt-wrong'

const RPC_SUCCESS_CORRECT = {
  is_correct: true,
  correct_option_id: CORRECT_OPTION_ID,
  explanation_text: 'Because lift equals weight in level flight.',
  explanation_image_url: null,
}

const RPC_SUCCESS_WRONG = {
  is_correct: false,
  correct_option_id: CORRECT_OPTION_ID,
  explanation_text: null,
  explanation_image_url: null,
}

// ---- Helpers --------------------------------------------------------------

function buildSessionChain(override: Record<string, unknown> = {}) {
  const terminal = {
    data: { config: { question_ids: [QUESTION_ID] } },
    error: null,
    ...override,
  }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(terminal),
  }
}

function setupAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
}

function setupUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

function setupValidSession() {
  mockFrom.mockReturnValue(buildSessionChain())
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- checkAnswer ----------------------------------------------------------

describe('checkAnswer', () => {
  it('returns failure when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('throws a ZodError when questionId is not a valid UUID', async () => {
    setupAuthenticatedUser()
    await expect(
      checkAnswer({
        questionId: 'not-a-uuid',
        selectedOptionId: CORRECT_OPTION_ID,
        sessionId: SESSION_ID,
      }),
    ).rejects.toThrow()
  })

  it('throws a ZodError when selectedOptionId is an empty string', async () => {
    setupAuthenticatedUser()
    await expect(
      checkAnswer({ questionId: QUESTION_ID, selectedOptionId: '', sessionId: SESSION_ID }),
    ).rejects.toThrow()
  })

  it('throws a ZodError when raw input is missing required fields', async () => {
    setupAuthenticatedUser()
    await expect(checkAnswer({})).rejects.toThrow()
  })

  it('returns failure when session does not belong to user', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildSessionChain({ data: null, error: { message: 'not found' } }))

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Session not found')
  })

  it('returns failure when questionId is not in session', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(
      buildSessionChain({ data: { config: { question_ids: ['other-question-id'] } } }),
    )

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Question not in session')
  })

  it('returns failure when the RPC returns an error', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'question not found or has no correct option' },
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    consoleSpy.mockRestore()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Question not found')
  })

  it('returns failure when data is null with no error', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: null, error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    consoleSpy.mockRestore()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Question not found')
  })

  it('returns isCorrect true when selectedOptionId matches the correct option', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS_CORRECT, error: null })

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.isCorrect).toBe(true)
    expect(result.correctOptionId).toBe(CORRECT_OPTION_ID)
  })

  it('returns isCorrect false when selectedOptionId does not match the correct option', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS_WRONG, error: null })

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: WRONG_OPTION_ID,
      sessionId: SESSION_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.isCorrect).toBe(false)
    expect(result.correctOptionId).toBe(CORRECT_OPTION_ID)
  })

  it('includes explanation text and image URL in a successful result', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({
      data: {
        is_correct: true,
        correct_option_id: CORRECT_OPTION_ID,
        explanation_text: 'Bernoulli explains lift.',
        explanation_image_url: 'https://cdn.example.com/lift-diagram.png',
      },
      error: null,
    })

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.explanationText).toBe('Bernoulli explains lift.')
    expect(result.explanationImageUrl).toBe('https://cdn.example.com/lift-diagram.png')
  })

  it('returns null explanation fields when question has no explanation', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({
      data: {
        is_correct: true,
        correct_option_id: CORRECT_OPTION_ID,
        explanation_text: null,
        explanation_image_url: null,
      },
      error: null,
    })

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.explanationText).toBeNull()
    expect(result.explanationImageUrl).toBeNull()
  })

  it('calls the check_quiz_answer RPC with correct parameters', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS_CORRECT, error: null })

    await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'check_quiz_answer', {
      p_question_id: QUESTION_ID,
      p_selected_option_id: CORRECT_OPTION_ID,
    })
  })
})
