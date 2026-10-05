import { describe, expect, it } from 'vitest'
import { toRunnerMode } from './session-runner-mode'

describe('toRunnerMode', () => {
  it.each(['quick_quiz', 'smart_review'] as const)('runs %s as a practice quiz', (mode) => {
    expect(toRunnerMode(mode)).toEqual({ mode: 'study' })
  })

  it.each(['mock_exam', 'internal_exam', 'vfr_rt_exam'] as const)(
    'runs %s as an exam of its own mode',
    (mode) => {
      expect(toRunnerMode(mode)).toEqual({ mode: 'exam', examMode: mode })
    },
  )
})
