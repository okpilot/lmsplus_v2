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
const ORDERING_INPUT = {
  questionId: QUESTION_ID,
  sessionId: SESSION_ID,
  order: ['item-c', 'item-a', 'item-b'],
}
const DIAGRAM_INPUT = {
  questionId: QUESTION_ID,
  sessionId: SESSION_ID,
  mapping: [
    { zoneId: 'z1', labelId: 'l1' },
    { zoneId: 'z2', labelId: 'l2' },
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

const ORDERING_RPC_RESULT = {
  is_correct: false,
  correct_answer: null,
  blanks: null,
  correct_order: ['itm-mayday', 'itm-callsign', 'itm-nature'],
  explanation_text: 'Distress before urgency.',
  explanation_image_url: null,
}

const DIAGRAM_RPC_RESULT = {
  is_correct: true,
  correct_answer: null,
  blanks: null,
  correct_mapping: [
    { zone_id: 'z1', label_id: 'l1' },
    { zone_id: 'z2', label_id: 'l2' },
  ],
  explanation_text: 'RWY 27 left-hand pattern.',
  explanation_image_url: null,
}

// ---- Helpers --------------------------------------------------------------

function setupAuthenticatedUser() {
  mockVerifySessionUser.mockResolvedValue({ id: USER_ID, email: null })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('checkNonMcAnswer', () => {
  it('verifies the caller on the client that grades the answer', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: null, error: null })
    await checkNonMcAnswer(SHORT_INPUT)
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
    expect(mockRpc).toHaveBeenCalledWith(expect.any(String), expect.anything())
    expect(mockRpc.mock.contexts[0]).toBe(mockClient)
  })

  it('returns failure when the user is not authenticated', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await checkNonMcAnswer(SHORT_INPUT)
    expect(result).toEqual({
      success: false,
      error: 'Your sign-in has expired. Please sign in again.',
    })
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
    const result = await checkNonMcAnswer(SHORT_INPUT)
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: expected })
  })

  it('does not read quiz_sessions before grading', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: SHORT_RPC_RESULT, error: null })
    await checkNonMcAnswer(SHORT_INPUT)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('grades a short_answer and returns the canonical answer', async () => {
    setupAuthenticatedUser()
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
    mockRpc.mockResolvedValue({ data: SHORT_RPC_RESULT, error: null })
    await checkNonMcAnswer(SHORT_INPUT)
    expect(mockRpc).toHaveBeenCalledWith('check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_response_text: 'cleared to land',
    })
  })

  it('grades a dialog_fill and maps per-blank results to the client shape', async () => {
    setupAuthenticatedUser()
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
    mockRpc.mockResolvedValue({ data: DIALOG_RPC_RESULT, error: null })
    await checkNonMcAnswer(DIALOG_INPUT)
    expect(mockRpc).toHaveBeenCalledWith('check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_blank_answers: [
        { blank_index: 0, response_text: 'cleared' },
        { blank_index: 1, response_text: 'runway 27' },
      ],
    })
  })

  it('grades an ordering answer and returns the revealed canonical order', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: ORDERING_RPC_RESULT, error: null })
    const result = await checkNonMcAnswer(ORDERING_INPUT)
    expect(result).toEqual({
      success: true,
      questionType: 'ordering',
      isCorrect: false,
      correctOrder: ['itm-mayday', 'itm-callsign', 'itm-nature'],
      explanationText: 'Distress before urgency.',
      explanationImageUrl: null,
    })
  })

  it('sends p_order and leaves the other answer params unset for ordering', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: ORDERING_RPC_RESULT, error: null })
    await checkNonMcAnswer(ORDERING_INPUT)
    expect(mockRpc).toHaveBeenCalledWith('check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_order: ['item-c', 'item-a', 'item-b'],
    })
  })

  it('rejects an ordering payload with fewer than two items', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({ ...ORDERING_INPUT, order: ['item-a'] })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('grades a diagram_label answer and returns the revealed canonical mapping', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: DIAGRAM_RPC_RESULT, error: null })
    const result = await checkNonMcAnswer(DIAGRAM_INPUT)
    expect(result).toEqual({
      success: true,
      questionType: 'diagram_label',
      isCorrect: true,
      correctMapping: [
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z2', labelId: 'l2' },
      ],
      explanationText: 'RWY 27 left-hand pattern.',
      explanationImageUrl: null,
    })
  })

  it('sends p_mapping in the zone_id/label_id snake_case shape for diagram_label', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: DIAGRAM_RPC_RESULT, error: null })
    await checkNonMcAnswer(DIAGRAM_INPUT)
    expect(mockRpc).toHaveBeenCalledWith('check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_mapping: [
        { zone_id: 'z1', label_id: 'l1' },
        { zone_id: 'z2', label_id: 'l2' },
      ],
    })
  })

  it('rejects a diagram_label payload with a duplicate zoneId', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({
      ...DIAGRAM_INPUT,
      mapping: [
        { zoneId: 'z1', labelId: 'l1' },
        { zoneId: 'z1', labelId: 'l2' },
      ],
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects a diagram_label payload with an empty mapping array', async () => {
    setupAuthenticatedUser()
    const result = await checkNonMcAnswer({ ...DIAGRAM_INPUT, mapping: [] })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns a generic failure when the diagram_label RPC returns an unexpected shape', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: DIALOG_RPC_RESULT, error: null })
    const result = await checkNonMcAnswer(DIAGRAM_INPUT)
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
  })

  it('returns a generic failure when the ordering RPC returns an unexpected shape', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: DIALOG_RPC_RESULT, error: null })
    const result = await checkNonMcAnswer(ORDERING_INPUT)
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
  })

  it('returns a generic failure when the short_answer RPC errors', async () => {
    setupAuthenticatedUser()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await checkNonMcAnswer(SHORT_INPUT)
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
  })

  it('returns a generic failure when the short_answer RPC returns an unexpected shape', async () => {
    setupAuthenticatedUser()
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
