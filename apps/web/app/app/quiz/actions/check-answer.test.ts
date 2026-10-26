import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockVerifySessionUser, mockRpc, mockFrom, mockClient } = vi.hoisted(() => {
  const from = vi.fn()
  const mockRpc = vi.fn()
  return {
    mockVerifySessionUser: vi.fn(),
    mockRpc,
    mockFrom: from,
    mockClient: { from, rpc: mockRpc },
  }
})

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({ verifySessionUser: mockVerifySessionUser }))

// ---- Subject under test ---------------------------------------------------

import { checkAnswer } from './check-answer'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'
const CORRECT_OPTION_ID = 'b'
const WRONG_OPTION_ID = 'c'

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

function setupAuthenticatedUser() {
  mockVerifySessionUser.mockResolvedValue({ id: USER_ID, email: null })
}

function setupUnauthenticated() {
  mockVerifySessionUser.mockResolvedValue(null)
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- checkAnswer ----------------------------------------------------------

describe('checkAnswer', () => {
  it('verifies the caller on the client that grades the answer', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS_CORRECT, error: null })
    await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
    expect(mockRpc).toHaveBeenCalledWith('check_quiz_answer', expect.anything())
    expect(mockRpc.mock.contexts[0]).toBe(mockClient)
  })

  it('returns failure when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Your sign-in has expired. Please sign in again.')
  })

  it('returns failure for a non-UUID question id', async () => {
    setupAuthenticatedUser()
    const result = await checkAnswer({
      questionId: 'not-a-uuid',
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['outside a-d', 'e'],
  ])('rejects a selected option id that is %s', async (_label, selectedOptionId) => {
    setupAuthenticatedUser()
    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId,
      sessionId: SESSION_ID,
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns failure for input missing required fields', async () => {
    setupAuthenticatedUser()
    const result = await checkAnswer({})
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it.each([
    [
      'the session is missing, foreign or ended',
      'session_not_found',
      'This session could not be found.',
    ],
    [
      'the question is outside the session',
      'question_not_in_session',
      'That question is not part of this session.',
    ],
  ])('reports a clear failure when %s', async (_label, rpcMessage, expected) => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: null, error: { message: rpcMessage } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    expect(consoleSpy).toHaveBeenCalledWith('[checkAnswer] RPC error:', rpcMessage, {
      questionId: QUESTION_ID,
      sessionId: SESSION_ID,
    })
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: expected })
  })

  it('does not read quiz_sessions before grading', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS_CORRECT, error: null })

    await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns failure when the RPC returns an error', async () => {
    setupAuthenticatedUser()
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
    expect(result.error).toBe('This question is no longer available.')
  })

  it('returns failure when data is null with no error', async () => {
    setupAuthenticatedUser()
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
    expect(result.error).toBe('Could not check answer')
  })

  it('returns failure when RPC returns a non-null primitive', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: 'unexpected-string', error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
      sessionId: SESSION_ID,
    })

    consoleSpy.mockRestore()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Could not check answer')
  })

  it('returns failure when RPC response is missing is_correct field', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({
      data: {
        correct_option_id: CORRECT_OPTION_ID,
        explanation_text: null,
        explanation_image_url: null,
        // is_correct intentionally omitted
      },
      error: null,
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
    expect(result.error).toBe('Could not check answer')
  })

  it('returns failure when RPC returns is_correct as a string instead of boolean', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({
      data: {
        is_correct: 'true',
        correct_option_id: CORRECT_OPTION_ID,
        explanation_text: null,
        explanation_image_url: null,
      },
      error: null,
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
    expect(result.error).toBe('Could not check answer')
  })

  it('returns failure when RPC returns correct_option_id as null instead of string', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({
      data: {
        is_correct: true,
        correct_option_id: null,
        explanation_text: null,
        explanation_image_url: null,
      },
      error: null,
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
    expect(result.error).toBe('Could not check answer')
  })

  it('returns failure when RPC returns explanation_text as a number instead of string or null', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({
      data: {
        is_correct: true,
        correct_option_id: CORRECT_OPTION_ID,
        explanation_text: 42,
        explanation_image_url: null,
      },
      error: null,
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
    expect(result.error).toBe('Could not check answer')
  })

  it('returns failure when RPC returns explanation_image_url as a number instead of string or null', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({
      data: {
        is_correct: false,
        correct_option_id: CORRECT_OPTION_ID,
        explanation_text: null,
        explanation_image_url: 0,
      },
      error: null,
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
    expect(result.error).toBe('Could not check answer')
  })

  it('returns isCorrect true when selectedOptionId matches the correct option', async () => {
    setupAuthenticatedUser()
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
})
