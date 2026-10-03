import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockRpc } = vi.hoisted(() => ({ mockGetUser: vi.fn(), mockRpc: vi.fn() }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

import { isDisplayableProgressError, SIGN_IN } from './progress-error-messages'
import { claimQuizSession, saveQuizAnswer, saveQuizPosition } from './quiz-progress'

const SESSION = '00000000-0000-4000-a000-000000000099'
const QUESTION = '00000000-0000-4000-a000-000000000011'
const DEVICE = '00000000-0000-4000-a000-0000000000d1'

const answerInput = {
  sessionId: SESSION,
  questionId: QUESTION,
  deviceId: DEVICE,
  answer: { selectedOptionId: 'b' },
  timeSpentMs: 900,
}
const positionInput = {
  sessionId: SESSION,
  deviceId: DEVICE,
  currentIndex: 2,
  pinnedQuestionIds: [QUESTION],
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  mockRpc.mockResolvedValue({ data: null, error: null })
})

describe('saveQuizAnswer', () => {
  it('saves the answer through the RPC with snake_case arguments', async () => {
    expect(await saveQuizAnswer(answerInput)).toEqual({ success: true })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'save_quiz_answer', {
      p_session_id: SESSION,
      p_question_id: QUESTION,
      p_answer: { selected_option_id: 'b' },
      p_time_spent_ms: 900,
      p_device_id: DEVICE,
    })
  })

  it('rejects invalid input without calling the RPC', async () => {
    expect(await saveQuizAnswer({ ...answerInput, timeSpentMs: undefined })).toEqual({
      success: false,
      error: 'Invalid input',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller without calling the RPC', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await saveQuizAnswer(answerInput)).toEqual({
      success: false,
      error: 'Your sign-in has expired. Please sign in again.',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('tells the student to sign in again when the sign-in has expired', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const results = [
      await saveQuizAnswer(answerInput),
      await saveQuizPosition(positionInput),
      await claimQuizSession({ sessionId: SESSION, deviceId: DEVICE }),
    ]
    for (const r of results) {
      expect(r).toEqual({ success: false, error: SIGN_IN })
    }
    expect(isDisplayableProgressError(SIGN_IN)).toBe(true)
  })

  it('tells the student the quiz is open elsewhere when another tab holds it', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_taken_over' } })
    expect(await saveQuizAnswer(answerInput)).toEqual({
      success: false,
      error: expect.stringMatching(/another tab or device/i),
    })
  })

  it('never returns the raw message of an unrecognised error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'deadlock detected' } })
    expect(await saveQuizAnswer(answerInput)).toEqual({
      success: false,
      error: 'Could not save progress',
    })
  })
})

describe('saveQuizPosition', () => {
  it('sends null question and time when there is no leaving pair', async () => {
    expect(await saveQuizPosition(positionInput)).toEqual({ success: true })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'save_quiz_position', {
      p_session_id: SESSION,
      p_current_index: 2,
      p_pinned_question_ids: [QUESTION],
      p_device_id: DEVICE,
      p_question_id: null,
      p_time_spent_ms: null,
    })
  })

  it('sends the left question and its visit time together', async () => {
    const leaving = { questionId: QUESTION, timeSpentMs: 4000 }
    await saveQuizPosition({ ...positionInput, leaving })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'save_quiz_position',
      expect.objectContaining({ p_question_id: QUESTION, p_time_spent_ms: 4000 }),
    )
  })

  it('rejects a leaving pair missing its time without calling the RPC', async () => {
    const result = await saveQuizPosition({ ...positionInput, leaving: { questionId: QUESTION } })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('maps an out-of-range position to reload copy', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'invalid_position' } })
    expect(await saveQuizPosition(positionInput)).toEqual({
      success: false,
      error: expect.stringMatching(/reload/i),
    })
  })
})

describe('claimQuizSession', () => {
  it('claims the session for the device', async () => {
    expect(await claimQuizSession({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: true,
    })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'claim_quiz_session', {
      p_session_id: SESSION,
      p_device_id: DEVICE,
    })
  })

  it('rejects a missing device id without calling the RPC', async () => {
    expect(await claimQuizSession({ sessionId: SESSION })).toEqual({
      success: false,
      error: 'Invalid input',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('tells the student a saved session cannot be claimed', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_saved' } })
    expect(await claimQuizSession({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: false,
      error: expect.stringMatching(/saved for later/i),
    })
  })
})
