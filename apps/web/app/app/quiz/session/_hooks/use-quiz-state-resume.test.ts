import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerFeedback } from '../../types'

const { mockRestored } = vi.hoisted(() => ({ mockRestored: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('./use-restored-feedback', () => ({
  useRestoredFeedback: (...a: unknown[]) => mockRestored(...a),
}))
vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: () => Promise.resolve({ success: true }),
  saveQuizPosition: () => Promise.resolve({ success: true }),
}))
vi.mock('../../actions/check-answer', () => ({ checkAnswer: vi.fn() }))
vi.mock('../../_hooks/use-navigation-guard', () => ({ useNavigationGuard: vi.fn() }))
vi.mock('./use-quiz-persistence', () => ({ useQuizPersistence: () => ({ checkpoint: vi.fn() }) }))

import { useQuizState } from './use-quiz-state'

const Q1 = '00000000-0000-4000-a000-000000000011'
const Q2 = '00000000-0000-4000-a000-000000000022'
const FB: AnswerFeedback = {
  questionType: 'multiple_choice',
  isCorrect: false,
  correctOptionId: 'c',
  explanationText: null,
  explanationImageUrl: null,
}

function opts(over: Record<string, unknown> = {}) {
  return {
    userId: 'u',
    sessionId: '00000000-0000-4000-a000-000000000001',
    questions: [{ id: Q1 }, { id: Q2 }] as never,
    mode: 'study' as const,
    initialAnswers: { [Q1]: { selectedOptionId: 'a', responseTimeMs: 5 } },
    ...over,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRestored.mockReturnValue(new Map([[Q1, FB]]))
})

describe('useQuizState — restored feedback', () => {
  it('shows the restored feedback of the current question', () => {
    const { result } = renderHook(() => useQuizState(opts()))

    expect(result.current.currentFeedback).toEqual(FB)
    expect(result.current.feedback.get(Q1)).toEqual(FB)
  })

  it('re-checks restored answers in a practice quiz', () => {
    renderHook(() => useQuizState(opts()))

    expect(mockRestored).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, questionId: Q1, restorable: opts().initialAnswers }),
    )
  })

  it.each(['exam', 'discovery'] as const)('never re-checks in %s mode', (mode) => {
    renderHook(() => useQuizState(opts({ mode })))

    expect(mockRestored).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })
})
