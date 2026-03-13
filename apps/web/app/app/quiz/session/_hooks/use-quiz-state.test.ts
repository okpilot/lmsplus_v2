import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockSubmitQuizSession, mockSaveQuizDraft, mockCheckAnswer } = vi.hoisted(
  () => ({
    mockRouterPush: vi.fn(),
    mockSubmitQuizSession: vi.fn(),
    mockSaveQuizDraft: vi.fn(),
    mockCheckAnswer: vi.fn(),
  }),
)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('./quiz-submit', () => ({
  submitQuizSession: (...args: unknown[]) => mockSubmitQuizSession(...args),
  saveQuizDraft: (...args: unknown[]) => mockSaveQuizDraft(...args),
}))

vi.mock('./use-flagged-questions', () => ({
  useFlaggedQuestions: () => ({
    flaggedQuestions: new Set<string>(),
    toggleFlag: vi.fn(),
  }),
}))

vi.mock('../../_hooks/use-navigation-guard', () => ({
  useNavigationGuard: vi.fn(),
}))

vi.mock('../../actions/check-answer', () => ({
  checkAnswer: (...args: unknown[]) => mockCheckAnswer(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { useQuizState } from './use-quiz-state'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const Q1_ID = '00000000-0000-0000-0000-000000000011'
const Q2_ID = '00000000-0000-0000-0000-000000000022'
const Q3_ID = '00000000-0000-0000-0000-000000000033'

const THREE_QUESTIONS = [
  { id: Q1_ID, question_text: 'Q1', question_image_url: null, question_number: null, options: [] },
  { id: Q2_ID, question_text: 'Q2', question_image_url: null, question_number: null, options: [] },
  { id: Q3_ID, question_text: 'Q3', question_image_url: null, question_number: null, options: [] },
]

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockCheckAnswer.mockResolvedValue({
    success: true,
    isCorrect: true,
    correctOptionId: 'opt-a',
    explanationText: null,
    explanationImageUrl: null,
  })
})

// ---- Index initialisation -------------------------------------------------

describe('useQuizState — initial index clamping', () => {
  it('defaults to index 0 when no initialIndex is provided', () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    expect(result.current.currentIndex).toBe(0)
  })

  it('accepts a valid initialIndex within range', () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS, initialIndex: 2 }),
    )
    expect(result.current.currentIndex).toBe(2)
  })

  it('clamps initialIndex to the last valid index when it exceeds questions.length - 1', () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS, initialIndex: 99 }),
    )
    expect(result.current.currentIndex).toBe(2)
  })

  it('clamps negative initialIndex to 0', () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS, initialIndex: -5 }),
    )
    expect(result.current.currentIndex).toBe(0)
  })

  it('clamps to 0 when questions array is empty', () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: [], initialIndex: 3 }),
    )
    expect(result.current.currentIndex).toBe(0)
  })
})

// ---- Navigation -----------------------------------------------------------

describe('useQuizState — navigation', () => {
  it('navigates to a valid index', () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    act(() => result.current.navigateTo(1))
    expect(result.current.currentIndex).toBe(1)
  })

  it('does not navigate below index 0', () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    act(() => result.current.navigate(-1))
    expect(result.current.currentIndex).toBe(0)
  })

  it('does not navigate beyond the last question', () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS, initialIndex: 2 }),
    )
    act(() => result.current.navigate(1))
    expect(result.current.currentIndex).toBe(2)
  })

  it('navigate(+1) advances to the next question', () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS, initialIndex: 0 }),
    )
    act(() => result.current.navigate(1))
    expect(result.current.currentIndex).toBe(1)
  })
})

// ---- Answer selection -----------------------------------------------------

describe('useQuizState — answer selection', () => {
  it('records an answer for the current question', async () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSelectAnswer('opt-a'))
    expect(result.current.answeredCount).toBe(1)
    expect(result.current.existingAnswer?.selectedOptionId).toBe('opt-a')
  })

  it('ignores a second answer selection for the same question (re-entry guard)', async () => {
    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSelectAnswer('opt-a'))
    await act(async () => result.current.handleSelectAnswer('opt-b'))
    expect(result.current.answeredCount).toBe(1)
    // First answer is preserved; second call is a no-op
    expect(result.current.existingAnswer?.selectedOptionId).toBe('opt-a')
  })

  it('hydrates answers from initialAnswers', () => {
    const { result } = renderHook(() =>
      useQuizState({
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialAnswers: {
          [Q1_ID]: { selectedOptionId: 'opt-c', responseTimeMs: 1000 },
        },
      }),
    )
    expect(result.current.answeredCount).toBe(1)
  })
})

// ---- Submit ---------------------------------------------------------------

describe('useQuizState — handleSubmit', () => {
  it('navigates to the report page after a successful submission', async () => {
    const SUBMIT_SUCCESS = {
      success: true as const,
      totalQuestions: 3,
      correctCount: 2,
      scorePercentage: 67,
      results: [],
    }
    mockSubmitQuizSession.mockResolvedValue(SUBMIT_SUCCESS)

    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSubmit())

    expect(mockRouterPush).toHaveBeenCalledWith(`/app/quiz/report?session=${SESSION_ID}`)
  })

  it('sets error state when submission fails', async () => {
    mockSubmitQuizSession.mockResolvedValue({
      success: false as const,
      error: 'Session expired',
    })

    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSubmit())

    expect(result.current.error).toBe('Session expired')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})

// ---- Save draft -----------------------------------------------------------

describe('useQuizState — handleSave', () => {
  it('delegates to saveQuizDraft with correct arguments', async () => {
    mockSaveQuizDraft.mockResolvedValue({ success: true as const })

    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS, initialIndex: 1 }),
    )
    await act(async () => result.current.handleSave())

    expect(mockSaveQuizDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        questionIds: [Q1_ID, Q2_ID, Q3_ID],
        currentIndex: 1,
      }),
    )
  })

  it('sets error state when saving the draft fails', async () => {
    mockSaveQuizDraft.mockResolvedValue({ success: false as const, error: 'Failed to save draft' })

    const { result } = renderHook(() =>
      useQuizState({ sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSave())

    expect(result.current.error).toBe('Failed to save draft')
  })

  it('forwards subjectName and subjectCode to saveQuizDraft when provided', async () => {
    mockSaveQuizDraft.mockResolvedValue({ success: true as const })

    const { result } = renderHook(() =>
      useQuizState({
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        subjectName: 'Air Law',
        subjectCode: 'ALW',
      }),
    )
    await act(async () => result.current.handleSave())

    expect(mockSaveQuizDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectName: 'Air Law',
        subjectCode: 'ALW',
      }),
    )
  })
})
