import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const {
  mockRouterPush,
  mockHandleSubmitSession,
  mockHandleSaveSession,
  mockHandleDiscardSession,
  mockCheckAnswer,
  mockCheckpoint,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockHandleSubmitSession: vi.fn(),
  mockHandleSaveSession: vi.fn(),
  mockHandleDiscardSession: vi.fn(),
  mockCheckAnswer: vi.fn(),
  mockCheckpoint: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('./quiz-submit', () => ({
  submitQuizSession: vi.fn(),
  saveQuizDraft: vi.fn(),
  discardQuizSession: vi.fn(),
  handleSubmitSession: (...args: unknown[]) => mockHandleSubmitSession(...args),
  handleSaveSession: (...args: unknown[]) => mockHandleSaveSession(...args),
  handleDiscardSession: (...args: unknown[]) => mockHandleDiscardSession(...args),
}))

vi.mock('./use-pinned-questions', () => ({
  usePinnedQuestions: () => ({
    pinnedQuestions: new Set<string>(),
    togglePin: vi.fn(),
  }),
}))

vi.mock('../../_hooks/use-navigation-guard', () => ({
  useNavigationGuard: vi.fn(),
}))

vi.mock('../../actions/check-answer', () => ({
  checkAnswer: (...args: unknown[]) => mockCheckAnswer(...args),
}))

vi.mock('./use-quiz-persistence', () => ({
  useQuizPersistence: () => ({ checkpoint: mockCheckpoint }),
}))

// ---- Subject under test ---------------------------------------------------

import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { useQuizState } from './use-quiz-state'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'
const Q3_ID = '00000000-0000-4000-a000-000000000033'

const THREE_QUESTIONS = [
  {
    id: Q1_ID,
    question_text: 'Q1',
    question_image_url: null,
    question_number: null,
    explanation_text: null,
    explanation_image_url: null,
    options: [],
  },
  {
    id: Q2_ID,
    question_text: 'Q2',
    question_image_url: null,
    question_number: null,
    explanation_text: null,
    explanation_image_url: null,
    options: [],
  },
  {
    id: Q3_ID,
    question_text: 'Q3',
    question_image_url: null,
    question_number: null,
    explanation_text: null,
    explanation_image_url: null,
    options: [],
  },
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
  // Default: handlers resolve without side-effects (caller drives state via setters)
  mockHandleSubmitSession.mockResolvedValue(undefined)
  mockHandleSaveSession.mockResolvedValue(undefined)
  mockHandleDiscardSession.mockResolvedValue(undefined)
})

// ---- Index initialisation -------------------------------------------------

describe('useQuizState — initial index clamping', () => {
  it('defaults to index 0 when no initialIndex is provided', () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    expect(result.current.currentIndex).toBe(0)
  })

  it('accepts a valid initialIndex within range', () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialIndex: 2,
      }),
    )
    expect(result.current.currentIndex).toBe(2)
  })

  it('clamps initialIndex to the last valid index when it exceeds questions.length - 1', () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialIndex: 99,
      }),
    )
    expect(result.current.currentIndex).toBe(2)
  })

  it('clamps negative initialIndex to 0', () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialIndex: -5,
      }),
    )
    expect(result.current.currentIndex).toBe(0)
  })

  it('clamps to 0 when questions array is empty', () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: [],
        initialIndex: 3,
      }),
    )
    expect(result.current.currentIndex).toBe(0)
  })
})

// ---- Navigation -----------------------------------------------------------

describe('useQuizState — navigation', () => {
  it('navigates to a valid index', () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    act(() => result.current.navigateTo(1))
    expect(result.current.currentIndex).toBe(1)
  })

  it('does not navigate below index 0', () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    act(() => result.current.navigate(-1))
    expect(result.current.currentIndex).toBe(0)
  })

  it('does not navigate beyond the last question', () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialIndex: 2,
      }),
    )
    act(() => result.current.navigate(1))
    expect(result.current.currentIndex).toBe(2)
  })

  it('navigate(+1) advances to the next question', () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialIndex: 0,
      }),
    )
    act(() => result.current.navigate(1))
    expect(result.current.currentIndex).toBe(1)
  })
})

// ---- Answer selection -----------------------------------------------------

describe('useQuizState — answer selection', () => {
  it('records an answer for the current question', async () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSelectAnswer('opt-a'))
    expect(result.current.answeredCount).toBe(1)
    expect(result.current.existingAnswer?.selectedOptionId).toBe('opt-a')
  })

  it('ignores a second answer for an already-answered question', async () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSelectAnswer('opt-a'))
    await act(async () => result.current.handleSelectAnswer('opt-b'))
    expect(result.current.answeredCount).toBe(1)
    // First answer is preserved; second call is a no-op
    expect(result.current.existingAnswer?.selectedOptionId).toBe('opt-a')
  })

  it('blocks concurrent answer selections until the first completes', async () => {
    // Simulate a slow checkAnswer so both calls can be in-flight simultaneously.
    // Without lockedQuestionsRef, both calls would pass the answers.has() check
    // (state hasn't updated yet) and both would call checkAnswer.
    // With the ref lock, the second call should be dropped immediately.
    let resolveFirst: (() => void) | null = null
    mockCheckAnswer.mockImplementationOnce(
      () =>
        new Promise<{
          success: boolean
          isCorrect: boolean
          correctOptionId: string
          explanationText: null
          explanationImageUrl: null
        }>((resolve) => {
          resolveFirst = () =>
            resolve({
              success: true,
              isCorrect: true,
              correctOptionId: 'opt-a',
              explanationText: null,
              explanationImageUrl: null,
            })
        }),
    )

    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )

    // Fire both calls without awaiting between them — simulating a rapid double-click.
    // The second call must be blocked by lockedQuestionsRef before state has settled.
    await act(async () => {
      const p1 = result.current.handleSelectAnswer('opt-a')
      const p2 = result.current.handleSelectAnswer('opt-b')
      resolveFirst?.()
      await Promise.all([p1, p2])
    })

    // Only one checkAnswer call despite two handleSelectAnswer invocations.
    expect(mockCheckAnswer).toHaveBeenCalledTimes(1)
    // Only opt-a was recorded; opt-b was dropped by the ref lock.
    expect(result.current.existingAnswer?.selectedOptionId).toBe('opt-a')
    expect(result.current.answeredCount).toBe(1)
  })

  it('restores previously saved answers on mount', () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
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

describe('useQuizState — handleSubmit empty-answers guard', () => {
  it('shows error when submitting with no answers recorded', async () => {
    // Simulate the empty-answers guard: handleSubmitSession calls setError when answers empty.
    // We replicate the guard by having the mock invoke setError via the passed opts.
    mockHandleSubmitSession.mockImplementation(
      (opts: { answers: Map<unknown, unknown>; setError: (e: string | null) => void }) => {
        if (opts.answers.size === 0) opts.setError('No answers to submit.')
      },
    )

    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSubmit())

    expect(result.current.error).toBe('No answers to submit.')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})

describe('useQuizState — handleSubmit', () => {
  it('navigates to the report page after a successful submission', async () => {
    mockHandleSubmitSession.mockImplementation(
      (opts: {
        router: { push: (url: string) => void }
        sessionId: string
        onSuccess: () => void
      }) => {
        opts.onSuccess()
        opts.router.push(`/app/quiz/report?session=${opts.sessionId}`)
      },
    )

    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialAnswers: { [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 1000 } },
      }),
    )
    await act(async () => result.current.handleSubmit())

    expect(mockRouterPush).toHaveBeenCalledWith(`/app/quiz/report?session=${SESSION_ID}`)
  })

  it('shows error when submission fails', async () => {
    mockHandleSubmitSession.mockImplementation(
      (opts: { setError: (e: string | null) => void; setSubmitting: (v: boolean) => void }) => {
        opts.setError('Session expired')
        opts.setSubmitting(false)
      },
    )

    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialAnswers: { [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 1000 } },
      }),
    )
    await act(async () => result.current.handleSubmit())

    expect(result.current.error).toBe('Session expired')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})

// ---- Save draft -----------------------------------------------------------

describe('useQuizState — handleSave', () => {
  it('saves current progress with correct quiz data', async () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialIndex: 1,
      }),
    )
    await act(async () => result.current.handleSave())

    expect(mockHandleSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        currentIndex: 1,
      }),
    )
  })

  it('shows error when saving fails', async () => {
    mockHandleSaveSession.mockImplementation(
      (opts: { setError: (e: string | null) => void; setSubmitting: (v: boolean) => void }) => {
        opts.setError('Failed to save draft')
        opts.setSubmitting(false)
      },
    )

    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSave())

    expect(result.current.error).toBe('Failed to save draft')
  })

  it('includes draft id when saving existing draft', async () => {
    const DRAFT_ID = '00000000-0000-4000-a000-000000000050'
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        draftId: DRAFT_ID,
      }),
    )
    await act(async () => result.current.handleSave())

    expect(mockHandleSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: DRAFT_ID }),
    )
  })

  it('includes subject metadata when saving', async () => {
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        subjectName: 'Air Law',
        subjectCode: 'ALW',
      }),
    )
    await act(async () => result.current.handleSave())

    expect(mockHandleSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectName: 'Air Law',
        subjectCode: 'ALW',
      }),
    )
  })
})

// ---- Discard session ------------------------------------------------------

describe('useQuizState — handleDiscard', () => {
  it('discards the current quiz session', async () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleDiscard())

    expect(mockHandleDiscardSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID }),
    )
  })

  it('includes draft id when discarding', async () => {
    const DRAFT_ID = '00000000-0000-4000-a000-000000000050'
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        draftId: DRAFT_ID,
      }),
    )
    await act(async () => result.current.handleDiscard())

    expect(mockHandleDiscardSession).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: DRAFT_ID }),
    )
  })

  it('shows error when discard fails', async () => {
    mockHandleDiscardSession.mockImplementation(
      (opts: { setError: (e: string | null) => void; setSubmitting: (v: boolean) => void }) => {
        opts.setError('Discard failed')
        opts.setSubmitting(false)
      },
    )

    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleDiscard())

    expect(result.current.error).toBe('Discard failed')
  })
})

// ---- Finish dialog ---------------------------------------------------------

describe('useQuizState — showFinishDialog', () => {
  it('finish dialog is hidden by default', () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    expect(result.current.showFinishDialog).toBe(false)
  })

  it('opens the finish dialog', () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    act(() => result.current.setShowFinishDialog(true))
    expect(result.current.showFinishDialog).toBe(true)
  })

  it('closes the finish dialog', () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    act(() => result.current.setShowFinishDialog(true))
    act(() => result.current.setShowFinishDialog(false))
    expect(result.current.showFinishDialog).toBe(false)
  })
})

// ---- Navigation guard -------------------------------------------------------

describe('useQuizState — navigation guard condition', () => {
  // Cast to MockInstance so we can inspect calls without TypeScript complaining
  // about the vi.fn() mock type vs the real function type.
  let navGuardMock: MockInstance

  beforeEach(() => {
    navGuardMock = useNavigationGuard as unknown as MockInstance
  })

  it('does not activate the guard when no answers exist', () => {
    renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    // The last call reflects the final render — guard should be inactive.
    const lastCall = navGuardMock.mock.calls[navGuardMock.mock.calls.length - 1]
    expect(lastCall?.[0]).toBe(false)
  })

  it('activates the guard after a new answer is recorded', async () => {
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )
    await act(async () => result.current.handleSelectAnswer('opt-a'))

    const lastCall = navGuardMock.mock.calls[navGuardMock.mock.calls.length - 1]
    expect(lastCall?.[0]).toBe(true)
  })

  it('does not activate the guard when mounted with pre-existing answers matching current count', () => {
    // initialAnswers provides one pre-loaded answer. On mount, answers.size === initialSize === 1,
    // so the condition (answers.size > initialSize) is false — guard must remain inactive.
    renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialAnswers: {
          [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 1000 },
        },
      }),
    )
    const lastCall = navGuardMock.mock.calls[navGuardMock.mock.calls.length - 1]
    expect(lastCall?.[0]).toBe(false)
  })

  it('activates the guard when a new answer is added beyond the pre-loaded count', async () => {
    // Mount with one pre-loaded answer (initialSize = 1). Adding a second answer
    // makes answers.size (2) > initialSize (1), so the guard activates.
    const { result } = renderHook(() =>
      useQuizState({
        userId: 'test-user-id',
        sessionId: SESSION_ID,
        questions: THREE_QUESTIONS,
        initialAnswers: {
          [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 1000 },
        },
        initialIndex: 1,
      }),
    )
    await act(async () => result.current.handleSelectAnswer('opt-b'))

    const lastCall = navGuardMock.mock.calls[navGuardMock.mock.calls.length - 1]
    expect(lastCall?.[0]).toBe(true)
  })
})

// ---- wrappedNavigateTo checkpoint behaviour -----------------------------------

describe('useQuizState — navigateTo checkpoint excludes pending answer', () => {
  it('passes the full answers map to checkpoint when no checkAnswer is in-flight', async () => {
    mockCheckAnswer.mockResolvedValue({
      success: true,
      isCorrect: true,
      correctOptionId: 'opt-a',
      explanationText: null,
      explanationImageUrl: null,
    })
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )

    // Answer Q1 fully so it is confirmed in the map
    await act(async () => {
      await result.current.handleSelectAnswer('opt-a')
    })

    // Navigate — no in-flight checkAnswer; checkpoint should receive the full map
    mockCheckpoint.mockClear()
    act(() => result.current.navigateTo(1))

    expect(mockCheckpoint).toHaveBeenCalledTimes(1)
    const [passedAnswers] = mockCheckpoint.mock.calls[0] as [Map<string, unknown>, number]
    expect(passedAnswers).toBeInstanceOf(Map)
    expect(passedAnswers.has(Q1_ID)).toBe(true)
  })

  it('passes a map without the pending question to checkpoint while checkAnswer is in-flight', async () => {
    // Create a deferred promise so we can navigate while checkAnswer is still awaiting
    let resolveCheckAnswer!: (v: {
      success: true
      isCorrect: boolean
      correctOptionId: string
      explanationText: null
      explanationImageUrl: null
    }) => void
    mockCheckAnswer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCheckAnswer = resolve
        }),
    )

    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )

    // Start answering Q1 but do NOT await — leave checkAnswer in-flight
    let answerPromise: Promise<boolean>
    act(() => {
      answerPromise = result.current.handleSelectAnswer('opt-a')
    })

    // Navigate while the answer is still pending (checkAnswer has not resolved)
    mockCheckpoint.mockClear()
    act(() => result.current.navigateTo(1))

    // Checkpoint must have been called with a map that does NOT include the pending Q1 answer
    expect(mockCheckpoint).toHaveBeenCalledTimes(1)
    const [passedAnswers, passedIndex] = mockCheckpoint.mock.calls[0] as [
      Map<string, unknown>,
      number,
    ]
    expect(passedAnswers).toBeInstanceOf(Map)
    expect(passedAnswers.has(Q1_ID)).toBe(false)
    expect(passedIndex).toBe(1)

    // Resolve the in-flight call so the hook cleans up properly
    await act(async () => {
      resolveCheckAnswer({
        success: true,
        isCorrect: true,
        correctOptionId: 'opt-a',
        explanationText: null,
        explanationImageUrl: null,
      })
      await answerPromise
    })
  })

  it('passes the full answers map to checkpoint after the in-flight checkAnswer resolves', async () => {
    mockCheckAnswer.mockResolvedValue({
      success: true,
      isCorrect: true,
      correctOptionId: 'opt-a',
      explanationText: null,
      explanationImageUrl: null,
    })
    const { result } = renderHook(() =>
      useQuizState({ userId: 'test-user-id', sessionId: SESSION_ID, questions: THREE_QUESTIONS }),
    )

    // Complete the answer so pendingQuestionIdRef is empty
    await act(async () => {
      await result.current.handleSelectAnswer('opt-a')
    })

    // Navigate — pendingQuestionIdRef is empty; checkpoint receives full map
    mockCheckpoint.mockClear()
    act(() => result.current.navigateTo(1))

    expect(mockCheckpoint).toHaveBeenCalledTimes(1)
    const [passedAnswers] = mockCheckpoint.mock.calls[0] as [Map<string, unknown>, number]
    expect(passedAnswers.has(Q1_ID)).toBe(true)
  })
})
