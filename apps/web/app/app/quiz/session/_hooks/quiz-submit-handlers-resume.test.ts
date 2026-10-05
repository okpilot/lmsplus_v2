import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRouterPush,
  mockBatchSubmitQuiz,
  mockSubmitEmptyExamSession,
  mockSubmitVfrRtExam,
  mockCheckAnswer,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockBatchSubmitQuiz: vi.fn(),
  mockSubmitEmptyExamSession: vi.fn(),
  mockSubmitVfrRtExam: vi.fn(),
  mockCheckAnswer: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }))
vi.mock('../../actions/batch-submit', () => ({ batchSubmitQuiz: mockBatchSubmitQuiz }))
vi.mock('../../actions/submit-empty-exam', () => ({
  submitEmptyExamSession: mockSubmitEmptyExamSession,
}))
vi.mock('@/app/app/vfr-rt-exam/actions/submit', () => ({ submitVfrRtExam: mockSubmitVfrRtExam }))
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
  mockBatchSubmitQuiz.mockResolvedValue({ success: true })
  mockSubmitVfrRtExam.mockResolvedValue({ success: true })
  mockCheckAnswer.mockResolvedValue({
    success: true,
    isCorrect: true,
    correctOptionId: 'a',
    explanationText: null,
    explanationImageUrl: null,
  })
})

describe('finishing a resumed session', () => {
  it('a resumed practice session submits every seeded answer plus new ones to batchSubmitQuiz', async () => {
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

    const sent = mockBatchSubmitQuiz.mock.calls[0]?.[0] as {
      sessionId: string
      answers: { questionId: string }[]
    }
    expect(sent.sessionId).toBe(SESSION_ID)
    expect(sent.answers.map((a) => a.questionId).sort()).toEqual([Q1_ID, Q2_ID].sort())
  })

  it('a resumed mock_exam with no new answers still submits the seeded answers (not complete_empty)', async () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'u',
        sessionId: SESSION_ID,
        questions: QUESTIONS,
        mode: 'exam',
        examMode: 'mock_exam',
        initialAnswers: SEEDED,
      }),
    )
    await act(async () => result.current.handleSubmit())

    expect(mockSubmitEmptyExamSession).not.toHaveBeenCalled()
    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [expect.objectContaining({ questionId: Q1_ID, selectedOptionId: 'a' })],
    })
  })

  it('a resumed vfr_rt_exam passes the seeded answers to the exam submit', async () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'u',
        sessionId: SESSION_ID,
        questions: QUESTIONS,
        mode: 'exam',
        examMode: 'vfr_rt_exam',
        initialAnswers: SEEDED,
      }),
    )
    await act(async () => result.current.handleSubmit())

    expect(mockSubmitEmptyExamSession).not.toHaveBeenCalled()
    const sent = mockSubmitVfrRtExam.mock.calls[0]?.[0] as { answers: unknown[] }
    expect(sent.answers.length).toBeGreaterThan(0)
  })
})
