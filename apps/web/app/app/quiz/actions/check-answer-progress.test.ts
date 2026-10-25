import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockVerifySessionUser, mockRpc, mockClient } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  return { mockVerifySessionUser: vi.fn(), mockRpc, mockClient: { from: vi.fn(), rpc: mockRpc } }
})

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({ verifySessionUser: mockVerifySessionUser }))

import { checkAnswer } from './check-answer'

const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'
const DEVICE_ID = '00000000-0000-4000-a000-0000000000d1'
const RPC_RESULT = {
  is_correct: true,
  correct_option_id: 'b',
  explanation_text: null,
  explanation_image_url: null,
}
const INPUT = { questionId: QUESTION_ID, selectedOptionId: 'b', sessionId: SESSION_ID }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
  mockRpc.mockResolvedValue({ data: RPC_RESULT, error: null })
})

describe('checkAnswer progress save', () => {
  it('verifies the caller on the client that grades the answer', async () => {
    await checkAnswer(INPUT)
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
    expect(mockRpc).toHaveBeenCalledWith('check_quiz_answer', expect.anything())
    expect(mockRpc.mock.contexts[0]).toBe(mockClient)
  })

  it('forwards the device id and visit time to the RPC', async () => {
    await checkAnswer({ ...INPUT, deviceId: DEVICE_ID, timeSpentMs: 3200 })
    expect(mockRpc).toHaveBeenCalledWith('check_quiz_answer', {
      p_question_id: QUESTION_ID,
      p_selected_option_id: 'b',
      p_session_id: SESSION_ID,
      p_device_id: DEVICE_ID,
      p_time_spent_ms: 3200,
    })
  })

  it('omits device and visit time when the caller omits them', async () => {
    await checkAnswer(INPUT)
    expect(mockRpc).toHaveBeenCalledWith('check_quiz_answer', {
      p_question_id: QUESTION_ID,
      p_selected_option_id: 'b',
      p_session_id: SESSION_ID,
    })
  })

  it('rejects a device id that is not a uuid', async () => {
    const result = await checkAnswer({ ...INPUT, deviceId: 'tab-1' })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each([-1, 86_400_001])('rejects visit time %s', async (timeSpentMs) => {
    const result = await checkAnswer({ ...INPUT, timeSpentMs })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('tells the student the quiz is open elsewhere when the progress save is refused', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_taken_over' } })
    const result = await checkAnswer({ ...INPUT, deviceId: DEVICE_ID, timeSpentMs: 10 })
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/another tab or device/i),
    })
  })

  it('keeps the generic copy for an unrecognised RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    expect(await checkAnswer(INPUT)).toEqual({ success: false, error: 'Could not check answer' })
  })
})
