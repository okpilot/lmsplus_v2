import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue({
      data: { config: { question_ids: [QUESTION_ID] } },
      error: null,
    }),
  })
  mockRpc.mockResolvedValue({ data: RPC_RESULT, error: null })
})

describe('checkAnswer progress save', () => {
  it('forwards the device id and visit time to the RPC', async () => {
    await checkAnswer({ ...INPUT, deviceId: DEVICE_ID, timeSpentMs: 3200 })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'check_quiz_answer', {
      p_question_id: QUESTION_ID,
      p_selected_option_id: 'b',
      p_session_id: SESSION_ID,
      p_device_id: DEVICE_ID,
      p_time_spent_ms: 3200,
    })
  })

  it('sends null device and visit time when the caller omits them', async () => {
    await checkAnswer(INPUT)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'check_quiz_answer', {
      p_question_id: QUESTION_ID,
      p_selected_option_id: 'b',
      p_session_id: SESSION_ID,
      p_device_id: null,
      p_time_spent_ms: null,
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
    expect(await checkAnswer(INPUT)).toEqual({ success: false, error: 'Question not found' })
  })
})
