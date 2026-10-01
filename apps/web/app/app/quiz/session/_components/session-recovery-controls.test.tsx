import { describe, expect, it } from 'vitest'
import { discardCopy } from './session-recovery-controls'

describe('discardCopy', () => {
  it('names the exam in the title and description of an exam discard', () => {
    expect(discardCopy(true, 'Mock Exam')).toEqual({
      title: 'Discard Mock Exam?',
      description:
        'This will permanently discard your Mock Exam session. You cannot undo this action.',
    })
  })

  it('refers to progress when discarding a study session', () => {
    expect(discardCopy(false, 'Mock Exam')).toEqual({
      title: 'Discard quiz session?',
      description: 'This will permanently discard your progress. You cannot undo this action.',
    })
  })
})
