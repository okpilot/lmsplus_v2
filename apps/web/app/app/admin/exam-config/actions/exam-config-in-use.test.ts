import { describe, expect, it } from 'vitest'
import { examConfigWriteError } from './exam-config-in-use'

const REFUSAL =
  'This exam is used by a scheduled or open sitting. Close or cancel that sitting, or remove this subject from its candidates, before disabling the exam.'

describe('examConfigWriteError', () => {
  it('explains how to release an exam configuration used by a sitting', () => {
    expect(examConfigWriteError('exam_config_in_use', 'fallback')).toBe(REFUSAL)
  })
  it('returns the fallback for any other message', () => {
    expect(examConfigWriteError('some db error', 'fallback')).toBe('fallback')
  })
  it('returns the fallback for a message that only contains the token', () => {
    expect(examConfigWriteError('x exam_config_in_use y', 'fallback')).toBe('fallback')
  })
  it('returns the fallback for an undefined message', () => {
    expect(examConfigWriteError(undefined, 'fallback')).toBe('fallback')
  })
})
