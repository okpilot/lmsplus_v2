import { describe, expect, it } from 'vitest'
import { EXAM_MODES, isExamMode, MODE_LABELS, type QuizMode } from './exam-modes'

describe('MODE_LABELS', () => {
  it('provides a label for every quiz_sessions.mode value', () => {
    const expectedKeys: QuizMode[] = ['smart_review', 'quick_quiz', 'mock_exam', 'internal_exam']
    for (const key of expectedKeys) {
      expect(MODE_LABELS[key]).toBeDefined()
    }
    // Guard against accidental extra keys drifting away from the DB enum.
    expect(Object.keys(MODE_LABELS).sort()).toEqual([...expectedKeys].sort())
  })

  it('renders the expected human-readable label per mode', () => {
    expect(MODE_LABELS.smart_review).toBe('Smart Review')
    expect(MODE_LABELS.quick_quiz).toBe('Quick Quiz')
    expect(MODE_LABELS.mock_exam).toBe('Practice Exam')
    expect(MODE_LABELS.internal_exam).toBe('Internal Exam')
  })

  it('uses non-empty strings for every label', () => {
    for (const label of Object.values(MODE_LABELS)) {
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })
})

describe('isExamMode', () => {
  it('returns true for exam modes', () => {
    expect(isExamMode('mock_exam')).toBe(true)
    expect(isExamMode('internal_exam')).toBe(true)
  })

  it('returns false for non-exam modes', () => {
    expect(isExamMode('quick_quiz')).toBe(false)
    expect(isExamMode('smart_review')).toBe(false)
  })

  it('returns false for unknown strings', () => {
    expect(isExamMode('garbage')).toBe(false)
    expect(isExamMode('')).toBe(false)
  })

  it('exposes EXAM_MODES that match the type guard', () => {
    for (const mode of EXAM_MODES) {
      expect(isExamMode(mode)).toBe(true)
    }
  })
})
