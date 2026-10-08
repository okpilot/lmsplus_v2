import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'

const { mockRestored } = vi.hoisted(() => ({ mockRestored: vi.fn() }))

vi.mock('./use-restored-feedback', () => ({
  useRestoredFeedback: (...a: unknown[]) => mockRestored(...a),
}))

import { useQuizStateExtras } from './use-quiz-state-extras'

const A: DraftAnswer = { selectedOptionId: 'a', responseTimeMs: 100 }
const merged = new Map<string, AnswerFeedback>()

function opts(over: Record<string, unknown> = {}) {
  return {
    mode: 'study',
    sessionId: 's1',
    initialAnswers: { q1: A },
    questions: [{ id: 'q1' }, { id: 'q2' }],
    ...over,
  } as unknown as QuizStateOpts
}

function run(o: { opts: QuizStateOpts; answers: Map<string, DraftAnswer> }) {
  const feedback = new Map<string, AnswerFeedback>()
  return renderHook(() =>
    useQuizStateExtras({
      opts: o.opts,
      answers: o.answers,
      p: { feedback },
    }),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRestored.mockReturnValue(merged)
})

describe('useQuizStateExtras', () => {
  it('returns the question ids in order and the restored feedback', () => {
    const { result } = run({ opts: opts(), answers: new Map() })

    expect(result.current.questionIds).toEqual(['q1', 'q2'])
    expect(result.current.feedback).toBe(merged)
  })

  it('passes the study-mode restore options through', () => {
    const answers = new Map([['q1', A]])
    run({ opts: opts(), answers })

    expect(mockRestored).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        sessionId: 's1',
        restorable: { q1: A },
        answers,
      }),
    )
  })

  it('does not restore feedback outside study mode', () => {
    run({ opts: opts({ mode: 'quick_quiz' }), answers: new Map() })

    expect(mockRestored).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })
})
