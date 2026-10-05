import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'

const { mockGuard, mockRestored } = vi.hoisted(() => ({
  mockGuard: vi.fn(),
  mockRestored: vi.fn(),
}))

vi.mock('./use-quiz-navigation-guard', () => ({
  useQuizNavigationGuard: (...a: unknown[]) => mockGuard(...a),
}))
vi.mock('./use-restored-feedback', () => ({
  useRestoredFeedback: (...a: unknown[]) => mockRestored(...a),
}))

import { useQuizStateExtras } from './use-quiz-state-extras'

const A: DraftAnswer = { selectedOptionId: 'a', responseTimeMs: 100 }
const B: DraftAnswer = { selectedOptionId: 'b', responseTimeMs: 200 }
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

function run(o: { opts: QuizStateOpts; isExam?: boolean; answers: Map<string, DraftAnswer> }) {
  const feedback = new Map<string, AnswerFeedback>()
  return renderHook(() =>
    useQuizStateExtras({
      opts: o.opts,
      isExam: o.isExam ?? false,
      questionId: 'q2',
      answers: o.answers,
      p: { feedback, submitted: { current: false } },
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
        questionId: 'q2',
        restorable: { q1: A },
        answers,
      }),
    )
  })

  it('does not restore feedback outside study mode', () => {
    run({ opts: opts({ mode: 'quick_quiz' }), answers: new Map() })

    expect(mockRestored).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('arms the leave guard once answers go beyond the initial count', () => {
    run({
      opts: opts(),
      answers: new Map([
        ['q1', A],
        ['q2', B],
      ]),
    })

    expect(mockGuard).toHaveBeenCalledWith(true, false)
  })

  it('does not arm the leave guard for only the initial answers', () => {
    run({ opts: opts(), answers: new Map([['q1', A]]) })

    expect(mockGuard).toHaveBeenCalledWith(false, false)
  })

  it('never arms the leave guard in an exam', () => {
    run({
      opts: opts({ mode: 'exam' }),
      isExam: true,
      answers: new Map([
        ['q1', A],
        ['q2', B],
      ]),
    })

    expect(mockGuard).toHaveBeenCalledWith(false, false)
  })
})
