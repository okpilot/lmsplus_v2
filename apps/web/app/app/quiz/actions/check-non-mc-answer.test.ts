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

import { checkNonMcAnswer } from './check-non-mc-answer'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'

const SHORT_INPUT = {
  questionId: QUESTION_ID,
  sessionId: SESSION_ID,
  responseText: 'cleared to land',
}
const DIALOG_INPUT = {
  questionId: QUESTION_ID,
  sessionId: SESSION_ID,
  blankAnswers: [
    { index: 0, text: 'cleared' },
    { index: 1, text: 'runway 27' },
  ],
}

const SHORT_RPC_RESULT = {
  is_correct: true,
  correct_answer: 'cleared to land',
  blanks: null,
  explanation_text: 'Standard readback.',
  explanation_image_url: null,
}

const DIALOG_RPC_RESULT = {
  is_correct: false,
  correct_answer: null,
  blanks: [
    { index: 0, is_correct: true, canonical: 'cleared' },
    { index: 1, is_correct: false, canonical: 'runway two seven' },
  ],
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

function setupValidSession() {
  mockFrom.mockReturnValue(buildSessionChain())
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('checkNonMcAnswer', () => {
  it('returns failure when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await checkNonMcAnswer(SHORT_INPUT)
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('rejects a short_answer payload with an empty response text', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({ ...SHORT_INPUT, responseText: '' })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a dialog_fill payload with an empty blank list', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({ ...DIALOG_INPUT, blankAnswers: [] })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a dialog_fill blank index above the bound', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({
      ...DIALOG_INPUT,
      blankAnswers: [{ index: 10000, text: 'x' }],
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects input that is neither a short_answer nor a dialog_fill payload', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({ questionId: QUESTION_ID, sessionId: SESSION_ID })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns failure when the session is not found', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(
      buildSessionChain({ data: null, error: { code: 'PGRST116', message: 'no rows' } }),
    )
    const result = await checkNonMcAnswer(SHORT_INPUT)
    expect(result).toEqual({ success: false, error: 'Session not found' })
  })

  it('returns a generic failure and logs when the session lookup hits a real error', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(
      buildSessionChain({ data: null, error: { code: '08006', message: 'connection failure' } }),
    )
    const result = await checkNonMcAnswer(SHORT_INPUT)
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[checkNonMcAnswer] Session lookup error:',
      'connection failure',
    )
    consoleSpy.mockRestore()
  })

  it('returns failure when the question is not in the session', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(
      buildSessionChain({ data: { config: { question_ids: ['some-other-id'] } } }),
    )
    const result = await checkNonMcAnswer(SHORT_INPUT)
    expect(result).toEqual({ success: false, error: 'Question not in session' })
  })

  it('grades a short_answer and returns the canonical answer', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: SHORT_RPC_RESULT, error: null })
    const result = await checkNonMcAnswer(SHORT_INPUT)
    expect(result).toEqual({
      success: true,
      questionType: 'short_answer',
      isCorrect: true,
      correctAnswer: 'cleared to land',
      explanationText: 'Standard readback.',
      explanationImageUrl: null,
    })
  })

  it('sends p_response_text and leaves p_blank_answers unset for short_answer', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: SHORT_RPC_RESULT, error: null })
    await checkNonMcAnswer(SHORT_INPUT)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_response_text: 'cleared to land',
    })
  })

  it('grades a dialog_fill and maps per-blank results to the client shape', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: DIALOG_RPC_RESULT, error: null })
    const result = await checkNonMcAnswer(DIALOG_INPUT)
    expect(result).toEqual({
      success: true,
      questionType: 'dialog_fill',
      isCorrect: false,
      blanks: [
        { index: 0, isCorrect: true, canonical: 'cleared' },
        { index: 1, isCorrect: false, canonical: 'runway two seven' },
      ],
      explanationText: null,
      explanationImageUrl: null,
    })
  })

  it('translates client blank indices to the RPC blank_index/response_text shape', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: DIALOG_RPC_RESULT, error: null })
    await checkNonMcAnswer(DIALOG_INPUT)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_blank_answers: [
        { blank_index: 0, response_text: 'cleared' },
        { blank_index: 1, response_text: 'runway 27' },
      ],
    })
  })

  it('returns a generic failure when the short_answer RPC errors', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await checkNonMcAnswer(SHORT_INPUT)
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
  })

  it('returns a generic failure when the short_answer RPC returns an unexpected shape', async () => {
    setupAuthenticatedUser()
    setupValidSession()
    mockRpc.mockResolvedValue({ data: DIALOG_RPC_RESULT, error: null })
    const result = await checkNonMcAnswer(SHORT_INPUT)
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
  })

  it('rejects a payload carrying both a response text and blank answers', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({
      ...SHORT_INPUT,
      blankAnswers: [{ index: 0, text: 'cleared' }],
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects a response text longer than the cap', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({ ...SHORT_INPUT, responseText: 'x'.repeat(501) })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects a whitespace-only response text', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({ ...SHORT_INPUT, responseText: '   ' })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects a blank answer longer than the cap', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({
      ...DIALOG_INPUT,
      blankAnswers: [{ index: 0, text: 'y'.repeat(201) }],
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects a whitespace-only blank answer', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({
      ...DIALOG_INPUT,
      blankAnswers: [{ index: 0, text: '   ' }],
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
