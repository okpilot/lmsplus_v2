import { afterEach, describe, expect, it, vi } from 'vitest'
import { toAnswerJson, toProgressResult } from './quiz-progress-helpers'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('toAnswerJson', () => {
  it('shapes a multiple choice selection', () => {
    expect(toAnswerJson({ selectedOptionId: 'c' })).toEqual({ selected_option_id: 'c' })
  })

  it('shapes short answer text', () => {
    expect(toAnswerJson({ responseText: 'cleared' })).toEqual({ response_text: 'cleared' })
  })

  it('shapes dialog fill blanks with blank_index and response_text', () => {
    expect(toAnswerJson({ blankAnswers: [{ index: 2, text: 'wind' }] })).toEqual({
      blanks: [{ blank_index: 2, response_text: 'wind' }],
    })
  })

  it('shapes an ordering sequence', () => {
    expect(toAnswerJson({ order: ['b', 'a'] })).toEqual({ order: ['b', 'a'] })
  })

  it('shapes a diagram mapping with zone_id and label_id', () => {
    expect(toAnswerJson({ mapping: [{ zoneId: 'z1', labelId: 'l1' }] })).toEqual({
      mapping: [{ zone_id: 'z1', label_id: 'l1' }],
    })
  })
})

describe('toProgressResult', () => {
  it('reports success when there is no error', () => {
    expect(toProgressResult(null, 'x')).toEqual({ success: true })
  })

  it('returns mapped copy and logs the raw message server-side', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = toProgressResult({ message: 'session_taken_over' }, 'saveQuizAnswer')
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/another tab or device/i),
    })
    expect(spy).toHaveBeenCalledWith('[saveQuizAnswer] RPC error:', 'session_taken_over')
  })

  it('never returns the raw message of an unrecognised error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = toProgressResult({ message: 'relation quiz_x does not exist' }, 'x')
    expect(result).toEqual({ success: false, error: 'Could not save progress' })
  })
})
