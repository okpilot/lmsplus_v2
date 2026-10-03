import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

import {
  checkDiagramLabelAnswer,
  checkDialogFillAnswer,
  checkOrderingAnswer,
  checkShortAnswer,
} from './check-non-mc-answer-dispatch'
import type { SupabaseClient } from './check-non-mc-answer-helpers'

const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'
const DEVICE_ID = '00000000-0000-4000-a000-0000000000d1'
const FAKE_SUPABASE = {} as SupabaseClient
const IDS = { questionId: QUESTION_ID, sessionId: SESSION_ID }
const META = { deviceId: DEVICE_ID, timeSpentMs: 2500 }

const SHORT_RESULT = {
  is_correct: true,
  correct_answer: 'cleared',
  blanks: null,
  explanation_text: null,
  explanation_image_url: null,
}
const ORDERING_RESULT = {
  is_correct: false,
  correct_answer: null,
  blanks: null,
  correct_order: ['a', 'b'],
  explanation_text: null,
  explanation_image_url: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('checkShortAnswer', () => {
  it('maps a successful RPC result to the client short_answer shape', async () => {
    mockRpc.mockResolvedValue({ data: SHORT_RESULT, error: null })
    expect(await checkShortAnswer(FAKE_SUPABASE, { ...IDS, responseText: 'cleared' })).toEqual({
      success: true,
      questionType: 'short_answer',
      isCorrect: true,
      correctAnswer: 'cleared',
      explanationText: null,
      explanationImageUrl: null,
    })
  })

  it('forwards the device id and visit time with the response text', async () => {
    mockRpc.mockResolvedValue({ data: SHORT_RESULT, error: null })
    await checkShortAnswer(FAKE_SUPABASE, { ...IDS, ...META, responseText: 'cleared' })
    expect(mockRpc).toHaveBeenCalledWith(FAKE_SUPABASE, 'check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_device_id: DEVICE_ID,
      p_time_spent_ms: 2500,
      p_response_text: 'cleared',
    })
  })

  it('returns a generic failure for an unrecognised RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await checkShortAnswer(FAKE_SUPABASE, { ...IDS, responseText: 'x' })).toEqual({
      success: false,
      error: 'Could not check answer',
    })
  })
})

describe('checkOrderingAnswer', () => {
  it('maps a successful RPC result to the client ordering shape', async () => {
    mockRpc.mockResolvedValue({ data: ORDERING_RESULT, error: null })
    expect(await checkOrderingAnswer(FAKE_SUPABASE, { ...IDS, order: ['b', 'a'] })).toMatchObject({
      success: true,
      questionType: 'ordering',
      correctOrder: ['a', 'b'],
    })
  })

  it('forwards the order with null progress metadata when none is given', async () => {
    mockRpc.mockResolvedValue({ data: ORDERING_RESULT, error: null })
    await checkOrderingAnswer(FAKE_SUPABASE, { ...IDS, order: ['b', 'a'] })
    expect(mockRpc).toHaveBeenCalledWith(FAKE_SUPABASE, 'check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_device_id: null,
      p_time_spent_ms: null,
      p_order: ['b', 'a'],
    })
  })
})

describe('progress-save refusals', () => {
  it('tells the student the quiz is open elsewhere after a dialog_fill check', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_taken_over' } })
    const result = await checkDialogFillAnswer(FAKE_SUPABASE, {
      ...IDS,
      ...META,
      blankAnswers: [{ index: 0, text: 'x' }],
    })
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/another tab or device/i),
    })
  })

  it('shows mapped copy for a refused diagram_label progress save', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_ended' } })
    const result = await checkDiagramLabelAnswer(FAKE_SUPABASE, {
      ...IDS,
      mapping: [{ zoneId: 'z', labelId: 'l' }],
    })
    expect(result).toEqual({ success: false, error: 'This session has already ended.' })
  })

  it('forwards device id and time on the diagram_label call', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    await checkDiagramLabelAnswer(FAKE_SUPABASE, {
      ...IDS,
      ...META,
      mapping: [{ zoneId: 'z', labelId: 'l' }],
    })
    expect(mockRpc).toHaveBeenCalledWith(
      FAKE_SUPABASE,
      'check_non_mc_answer',
      expect.objectContaining({ p_device_id: DEVICE_ID, p_time_spent_ms: 2500 }),
    )
  })
})
