import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRouterReplace, mockFinishQuizSession, mockCheckAnswer } = vi.hoisted(() => ({
  mockRouterReplace: vi.fn(),
  mockFinishQuizSession: vi.fn(),
  mockCheckAnswer: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockRouterReplace }) }))
vi.mock('../../actions/finish', () => ({ finishQuizSession: mockFinishQuizSession }))
vi.mock('../../actions/clear-deployment-pin', () => ({
  clearDeploymentPin: () => Promise.resolve(),
}))
vi.mock('../../actions/discard', () => ({ discardQuiz: vi.fn() }))
vi.mock('../../actions/check-answer', () => ({ checkAnswer: mockCheckAnswer }))
vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: () => Promise.resolve({ success: true }),
  saveQuizPosition: () => Promise.resolve({ success: true }),
}))
vi.mock('../../_hooks/use-navigation-guard', () => ({ useNavigationGuard: vi.fn() }))
vi.mock('./use-pinned-questions', () => ({
  usePinnedQuestions: () => ({
    pinnedQuestions: new Set<string>(),
    pinnedRef: { current: new Set<string>() },
    togglePin: vi.fn(() => new Set<string>()),
  }),
}))

import { useQuizState } from './use-quiz-state'

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'

function makeQuestion(id: string) {
  return {
    id,
    question_text: id,
    question_image_url: null,
    question_number: null,
    explanation_text: null,
    explanation_image_url: null,
    options: [{ id: 'a', text: 'A' }],
    question_type: 'multiple_choice' as const,
    dialog_template: null,
    blanks_safe: null,
    ordering_items: null,
    diagram_config: null,
  }
}

const QUESTIONS = [makeQuestion(Q1_ID), makeQuestion(Q2_ID)]
const SEEDED = { [Q1_ID]: { selectedOptionId: 'a', responseTimeMs: 800 } }

beforeEach(() => {
  vi.resetAllMocks()
  mockFinishQuizSession.mockResolvedValue({ success: true })
  mockCheckAnswer.mockResolvedValue({
    success: true,
    isCorrect: true,
    correctOptionId: 'a',
    explanationText: null,
    explanationImageUrl: null,
  })
})

describe('finishing a resumed session', () => {
  it('a resumed practice session finishes on the server and opens the report', async () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'u',
        sessionId: SESSION_ID,
        questions: QUESTIONS,
        mode: 'study',
        initialAnswers: SEEDED,
        initialIndex: 1,
      }),
    )
    await act(async () => result.current.handleSelectAnswer('a'))
    await act(async () => result.current.handleSubmit())

    expect(mockFinishQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID }),
    )
    expect(mockRouterReplace).toHaveBeenCalledWith(`/app/quiz/report?session=${SESSION_ID}`)
  })

  it.each([
    ['mock_exam', '/app/quiz/report'],
    ['internal_exam', '/app/internal-exam/report'],
    ['vfr_rt_exam', '/app/vfr-rt/report'],
  ] as const)(
    'a resumed %s finishes on the server and opens its report',
    async (examMode, path) => {
      const { result } = renderHook(() =>
        useQuizState({
          userId: 'u',
          sessionId: SESSION_ID,
          questions: QUESTIONS,
          mode: 'exam',
          examMode,
          initialAnswers: SEEDED,
        }),
      )
      await act(async () => result.current.handleSubmit())

      expect(mockFinishQuizSession).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: SESSION_ID }),
      )
      expect(mockRouterReplace).toHaveBeenCalledWith(`${path}?session=${SESSION_ID}`)
    },
  )
})
