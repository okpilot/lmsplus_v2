import { describe, expect, it } from 'vitest'
import { canFlagQuestion } from './can-flag-question'

describe('canFlagQuestion', () => {
  it('suppresses flagging during a live internal exam', () => {
    expect(canFlagQuestion({ isExam: true, examMode: 'internal_exam' })).toBe(false)
  })

  it('allows flagging during a mock exam', () => {
    expect(canFlagQuestion({ isExam: true, examMode: 'mock_exam' })).toBe(true)
  })

  it('allows flagging in a practice session', () => {
    expect(canFlagQuestion({ isExam: false, examMode: undefined })).toBe(true)
  })

  it('allows flagging when the exam mode is unknown', () => {
    expect(canFlagQuestion({ isExam: true, examMode: undefined })).toBe(true)
  })
})
