import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback } from '../../types'
import { useQuizStateExtras } from './use-quiz-state-extras'

const opts = { questions: [{ id: 'q1' }, { id: 'q2' }] } as unknown as QuizStateOpts

describe('useQuizStateExtras', () => {
  it('returns the question ids in order and the pipeline feedback unchanged', () => {
    const feedback = new Map<string, AnswerFeedback>()

    const { result } = renderHook(() => useQuizStateExtras({ opts, p: { feedback } }))

    expect(result.current.questionIds).toEqual(['q1', 'q2'])
    expect(result.current.feedback).toBe(feedback)
  })
})
