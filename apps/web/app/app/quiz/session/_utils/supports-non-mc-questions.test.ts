import { describe, expect, it } from 'vitest'
import { supportsNonMcQuestions } from './supports-non-mc-questions'

describe('supportsNonMcQuestions', () => {
  it.each([
    [false, undefined, true],
    [true, 'vfr_rt_exam', true],
    [true, 'mock_exam', false],
    [true, 'internal_exam', false],
  ] as const)('isExam=%s examMode=%s supports non-MC: %s', (isExam, examMode, expected) => {
    expect(supportsNonMcQuestions({ isExam, examMode })).toBe(expected)
  })
})
