import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test (after mocks) ---------------------------------------

import { checkDiagramLabelAnswer, checkDialogFillAnswer } from './check-non-mc-answer-dispatch'
import type { SupabaseClient } from './check-non-mc-answer-helpers'

// ---- Fixtures -----------------------------------------------------------------

const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'
const FAKE_SUPABASE = {} as SupabaseClient

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

beforeEach(() => {
  vi.resetAllMocks()
})

describe('checkDialogFillAnswer', () => {
  it('maps a successful RPC result to the client dialog_fill shape', async () => {
    mockRpc.mockResolvedValue({ data: DIALOG_RPC_RESULT, error: null })
    const result = await checkDialogFillAnswer(FAKE_SUPABASE, QUESTION_ID, SESSION_ID, [
      { index: 0, text: 'cleared' },
      { index: 1, text: 'runway 27' },
    ])
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
    mockRpc.mockResolvedValue({ data: DIALOG_RPC_RESULT, error: null })
    await checkDialogFillAnswer(FAKE_SUPABASE, QUESTION_ID, SESSION_ID, [
      { index: 0, text: 'cleared' },
    ])
    expect(mockRpc).toHaveBeenCalledWith(FAKE_SUPABASE, 'check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_blank_answers: [{ blank_index: 0, response_text: 'cleared' }],
    })
  })

  it('returns a generic failure and logs when the RPC errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await checkDialogFillAnswer(FAKE_SUPABASE, QUESTION_ID, SESSION_ID, [
      { index: 0, text: 'cleared' },
    ])
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
    expect(consoleSpy).toHaveBeenCalledWith('[checkNonMcAnswer] dialog_fill RPC error:', 'boom')
    consoleSpy.mockRestore()
  })

  it('returns a generic failure when the RPC result has an unexpected shape', async () => {
    mockRpc.mockResolvedValue({ data: DIAGRAM_RPC_RESULT, error: null })
    const result = await checkDialogFillAnswer(FAKE_SUPABASE, QUESTION_ID, SESSION_ID, [
      { index: 0, text: 'cleared' },
    ])
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
  })
})

describe('checkDiagramLabelAnswer', () => {
  it('maps a successful RPC result to the client diagram_label shape', async () => {
    mockRpc.mockResolvedValue({ data: DIAGRAM_RPC_RESULT, error: null })
    const result = await checkDiagramLabelAnswer(FAKE_SUPABASE, QUESTION_ID, SESSION_ID, [
      { zoneId: 'z1', labelId: 'l1' },
    ])
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

  it('sends p_mapping with the zone_id/label_id snake_case shape', async () => {
    mockRpc.mockResolvedValue({ data: DIAGRAM_RPC_RESULT, error: null })
    await checkDiagramLabelAnswer(FAKE_SUPABASE, QUESTION_ID, SESSION_ID, [
      { zoneId: 'z1', labelId: 'l1' },
      { zoneId: 'z2', labelId: 'l2' },
    ])
    expect(mockRpc).toHaveBeenCalledWith(FAKE_SUPABASE, 'check_non_mc_answer', {
      p_question_id: QUESTION_ID,
      p_session_id: SESSION_ID,
      p_mapping: [
        { zone_id: 'z1', label_id: 'l1' },
        { zone_id: 'z2', label_id: 'l2' },
      ],
    })
  })

  it('returns a generic failure and logs when the RPC errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await checkDiagramLabelAnswer(FAKE_SUPABASE, QUESTION_ID, SESSION_ID, [
      { zoneId: 'z1', labelId: 'l1' },
    ])
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
    expect(consoleSpy).toHaveBeenCalledWith('[checkNonMcAnswer] diagram_label RPC error:', 'boom')
    consoleSpy.mockRestore()
  })

  it('returns a generic failure when the RPC result has an unexpected shape', async () => {
    mockRpc.mockResolvedValue({ data: DIALOG_RPC_RESULT, error: null })
    const result = await checkDiagramLabelAnswer(FAKE_SUPABASE, QUESTION_ID, SESSION_ID, [
      { zoneId: 'z1', labelId: 'l1' },
    ])
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
  })

  it('returns a generic failure when correct_mapping is empty', async () => {
    mockRpc.mockResolvedValue({
      data: { ...DIAGRAM_RPC_RESULT, correct_mapping: [] },
      error: null,
    })
    const result = await checkDiagramLabelAnswer(FAKE_SUPABASE, QUESTION_ID, SESSION_ID, [
      { zoneId: 'z1', labelId: 'l1' },
    ])
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
  })
})
