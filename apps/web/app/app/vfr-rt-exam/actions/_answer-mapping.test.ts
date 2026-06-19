import { describe, expect, it } from 'vitest'
import { AnswerEntry, toRpcAnswer } from './_answer-mapping'

const MC_Q = '00000000-0000-4000-a000-000000000011'
const SHORT_Q = '00000000-0000-4000-a000-000000000022'
const DIALOG_Q = '00000000-0000-4000-a000-000000000033'

// ---- AnswerEntry union validation ------------------------------------------

describe('AnswerEntry — schema validation', () => {
  it('accepts a valid multiple-choice entry', () => {
    const result = AnswerEntry.safeParse({
      questionId: MC_Q,
      selectedOptionId: 'c',
      responseTimeMs: 1500,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid short-answer entry', () => {
    const result = AnswerEntry.safeParse({
      questionId: SHORT_Q,
      responseText: 'runway 24',
      responseTimeMs: 2000,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid dialog-fill entry', () => {
    const result = AnswerEntry.safeParse({
      questionId: DIALOG_Q,
      blankIndex: 0,
      responseText: 'wilco',
      responseTimeMs: 800,
    })
    expect(result.success).toBe(true)
  })

  it('accepts entries without responseTimeMs (field is optional)', () => {
    const mc = AnswerEntry.safeParse({ questionId: MC_Q, selectedOptionId: 'a' })
    const short = AnswerEntry.safeParse({ questionId: SHORT_Q, responseText: 'cleared' })
    const dialog = AnswerEntry.safeParse({ questionId: DIALOG_Q, blankIndex: 1, responseText: 'x' })
    expect(mc.success).toBe(true)
    expect(short.success).toBe(true)
    expect(dialog.success).toBe(true)
  })

  it('rejects an MC entry that also carries response_text (strict mode disqualifies it from MC branch)', () => {
    const result = AnswerEntry.safeParse({
      questionId: MC_Q,
      selectedOptionId: 'b',
      responseText: 'extra',
    })
    expect(result.success).toBe(false)
  })

  it('accepts an entry with only questionId and responseText as a short answer', () => {
    const result = AnswerEntry.safeParse({ questionId: DIALOG_Q, responseText: 'wilco' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect('blankIndex' in result.data).toBe(false)
  })

  it('rejects an entry carrying an unknown extra key', () => {
    const result = AnswerEntry.safeParse({
      questionId: DIALOG_Q,
      responseText: 'x',
      blankIndex: 0,
      unknownExtra: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an MC entry with an option value outside a–d', () => {
    const result = AnswerEntry.safeParse({ questionId: MC_Q, selectedOptionId: 'e' })
    expect(result.success).toBe(false)
  })

  it('rejects a negative blankIndex', () => {
    const result = AnswerEntry.safeParse({
      questionId: DIALOG_Q,
      blankIndex: -1,
      responseText: 'x',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an entry with a non-UUID questionId', () => {
    const result = AnswerEntry.safeParse({ questionId: 'not-a-uuid', selectedOptionId: 'a' })
    expect(result.success).toBe(false)
  })

  it('rejects an entry missing questionId', () => {
    const result = AnswerEntry.safeParse({ selectedOptionId: 'a' })
    expect(result.success).toBe(false)
  })
})

// ---- toRpcAnswer snake_case mapping ----------------------------------------

describe('toRpcAnswer', () => {
  it('maps an MC entry to question_id + selected_option_id + response_time_ms', () => {
    const result = toRpcAnswer({ questionId: MC_Q, selectedOptionId: 'b', responseTimeMs: 2500 })
    expect(result).toEqual({
      question_id: MC_Q,
      selected_option_id: 'b',
      response_time_ms: 2500,
    })
  })

  it('maps a short-answer entry to question_id + response_text + response_time_ms', () => {
    const result = toRpcAnswer({
      questionId: SHORT_Q,
      responseText: 'climb FL050',
      responseTimeMs: 3000,
    })
    expect(result).toEqual({
      question_id: SHORT_Q,
      response_text: 'climb FL050',
      response_time_ms: 3000,
    })
  })

  it('maps a dialog entry to question_id + blank_index + response_text + response_time_ms', () => {
    const result = toRpcAnswer({
      questionId: DIALOG_Q,
      blankIndex: 2,
      responseText: 'wilco',
      responseTimeMs: 1200,
    })
    expect(result).toEqual({
      question_id: DIALOG_Q,
      blank_index: 2,
      response_text: 'wilco',
      response_time_ms: 1200,
    })
  })

  it('defaults missing responseTimeMs to 0 for all entry types', () => {
    const mc = toRpcAnswer({ questionId: MC_Q, selectedOptionId: 'a' })
    const short = toRpcAnswer({ questionId: SHORT_Q, responseText: 'x' })
    const dialog = toRpcAnswer({ questionId: DIALOG_Q, blankIndex: 0, responseText: 'y' })
    expect(mc.response_time_ms).toBe(0)
    expect(short.response_time_ms).toBe(0)
    expect(dialog.response_time_ms).toBe(0)
  })

  it('produces selected_option_id (not selected_option) matching the VFR RT RPC column name', () => {
    const result = toRpcAnswer({ questionId: MC_Q, selectedOptionId: 'd' })
    expect(result).toHaveProperty('selected_option_id')
    expect(result).not.toHaveProperty('selected_option')
  })

  it('produces blank_index in the dialog mapping (not blankIndex)', () => {
    const result = toRpcAnswer({ questionId: DIALOG_Q, blankIndex: 1, responseText: 'x' })
    expect(result).toHaveProperty('blank_index', 1)
    expect(result).not.toHaveProperty('blankIndex')
  })

  it('does not include selected_option_id on short-answer entries', () => {
    const result = toRpcAnswer({ questionId: SHORT_Q, responseText: 'x' })
    expect(result).not.toHaveProperty('selected_option_id')
  })

  it('does not include blank_index on short-answer entries', () => {
    const result = toRpcAnswer({ questionId: SHORT_Q, responseText: 'x' })
    expect(result).not.toHaveProperty('blank_index')
  })
})
