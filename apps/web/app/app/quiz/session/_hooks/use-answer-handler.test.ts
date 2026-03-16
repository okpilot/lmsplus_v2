import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockCheckAnswer } = vi.hoisted(() => ({
  mockCheckAnswer: vi.fn(),
}))

vi.mock('../../actions/check-answer', () => ({
  checkAnswer: (...args: unknown[]) => mockCheckAnswer(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { useAnswerHandler } from './use-answer-handler'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'
const OPT_A = 'opt-a'
const OPT_B = 'opt-b'

const SUCCESS_RESULT = {
  success: true as const,
  isCorrect: true,
  correctOptionId: OPT_A,
  explanationText: 'Because lift.',
  explanationImageUrl: null,
}

// ---- Helpers --------------------------------------------------------------

/**
 * Build default opts for the hook, allowing per-test overrides.
 * The answers Map and its setter are kept in React state via the outer hook,
 * but since useAnswerHandler manages setAnswers internally, we provide a
 * stable Map and capture setter calls via a spy.
 */
function renderAnswerHandler(questionId = Q1_ID) {
  // We track the answers Map ourselves so the hook sees consistent state.
  let answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
  const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
    answers = updater(answers)
  })

  const { result } = renderHook(() =>
    useAnswerHandler({
      sessionId: SESSION_ID,
      getQuestionId: () => questionId,
      getAnswerStartTime: () => Date.now() - 500,
      answers,
      setAnswers: setAnswers as React.Dispatch<
        React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
      >,
    }),
  )

  return { result, getAnswers: () => answers, setAnswers }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Happy path -----------------------------------------------------------

describe('useAnswerHandler — successful answer selection', () => {
  it('stores the answer in the answers map after a successful checkAnswer call', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const { result, getAnswers } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(getAnswers().get(Q1_ID)?.selectedOptionId).toBe(OPT_A)
  })

  it('populates feedback state with isCorrect and correctOptionId from the RPC', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const { result } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    const fb = result.current.feedback.get(Q1_ID)
    expect(fb?.isCorrect).toBe(true)
    expect(fb?.correctOptionId).toBe(OPT_A)
  })

  it('stores explanationText and explanationImageUrl from the RPC in feedback', async () => {
    mockCheckAnswer.mockResolvedValue({
      ...SUCCESS_RESULT,
      explanationText: 'Lift formula',
      explanationImageUrl: 'https://cdn.example.com/lift.png',
    })
    const { result } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    const fb = result.current.feedback.get(Q1_ID)
    expect(fb?.explanationText).toBe('Lift formula')
    expect(fb?.explanationImageUrl).toBe('https://cdn.example.com/lift.png')
  })

  it('clears any previous error after a successful check', async () => {
    // First call fails to set an error, second call succeeds to clear it.
    mockCheckAnswer.mockRejectedValueOnce(new Error('network down'))
    mockCheckAnswer.mockResolvedValueOnce(SUCCESS_RESULT)

    const { result, getAnswers, setAnswers } = renderAnswerHandler()

    // First call — sets error state
    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })
    expect(result.current.error).toBe('Failed to check answer. Please try again.')

    // Re-render the hook with the reverted (empty) answers map
    const { result: result2 } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers: getAnswers(),
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
      }),
    )

    // Second call — clears error
    await act(async () => {
      await result2.current.handleSelectAnswer(OPT_A)
    })
    expect(result2.current.error).toBeNull()
  })

  it('calls checkAnswer with questionId, selectedOptionId, and sessionId', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const { result } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(mockCheckAnswer).toHaveBeenCalledWith({
      questionId: Q1_ID,
      selectedOptionId: OPT_A,
      sessionId: SESSION_ID,
    })
  })
})

// ---- Lock guard -----------------------------------------------------------

describe('useAnswerHandler — re-entry guard', () => {
  it('ignores a second selection for the same question once an answer is recorded', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const { result, getAnswers } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    // answers Map already has Q1 — second call must be a no-op
    await act(async () => {
      await result.current.handleSelectAnswer(OPT_B)
    })

    expect(mockCheckAnswer).toHaveBeenCalledTimes(1)
    expect(getAnswers().get(Q1_ID)?.selectedOptionId).toBe(OPT_A)
  })

  it('blocks a concurrent double-click before the first async response settles', async () => {
    let resolveFirst: (() => void) | null = null
    mockCheckAnswer.mockImplementationOnce(
      () =>
        new Promise<typeof SUCCESS_RESULT>((resolve) => {
          resolveFirst = () => resolve(SUCCESS_RESULT)
        }),
    )

    const { result } = renderAnswerHandler()

    await act(async () => {
      const p1 = result.current.handleSelectAnswer(OPT_A)
      const p2 = result.current.handleSelectAnswer(OPT_B)
      resolveFirst?.()
      await Promise.all([p1, p2])
    })

    // Only one checkAnswer call despite two handleSelectAnswer invocations.
    expect(mockCheckAnswer).toHaveBeenCalledTimes(1)
  })
})

// ---- Error recovery -------------------------------------------------------

describe('useAnswerHandler — error recovery on checkAnswer failure', () => {
  it('sets the error message when checkAnswer throws a network error', async () => {
    mockCheckAnswer.mockRejectedValue(new Error('network error'))
    const { result } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(result.current.error).toBe('Failed to check answer. Please try again.')
  })

  it('sets the error message when checkAnswer returns success: false', async () => {
    mockCheckAnswer.mockResolvedValue({ success: false, error: 'Session not found' })
    const { result } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(result.current.error).toBe('Failed to check answer. Please try again.')
  })

  it('removes the answer from the map when checkAnswer fails (allows retry)', async () => {
    mockCheckAnswer.mockRejectedValue(new Error('timeout'))
    const { result, getAnswers } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    // The answer must have been reverted so the student can reselect.
    expect(getAnswers().has(Q1_ID)).toBe(false)
  })

  it('releases the ref lock after a failed call so the question can be answered again', async () => {
    mockCheckAnswer.mockRejectedValueOnce(new Error('timeout'))
    mockCheckAnswer.mockResolvedValueOnce(SUCCESS_RESULT)

    const { result, getAnswers } = renderAnswerHandler()

    // First attempt fails
    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })
    expect(result.current.error).toBe('Failed to check answer. Please try again.')

    // Second attempt must succeed because the lock was released
    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(mockCheckAnswer).toHaveBeenCalledTimes(2)
    expect(getAnswers().get(Q1_ID)?.selectedOptionId).toBe(OPT_A)
  })
})

// ---- Multiple questions ----------------------------------------------------

describe('useAnswerHandler — multiple questions', () => {
  it('stores feedback independently for different questions', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)

    // Render once per question ID by using a mutable ref inside the closure.
    let currentQuestion = Q1_ID
    const answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      const next = updater(answers)
      for (const [k, v] of next) answers.set(k, v)
    })

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => currentQuestion,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
      }),
    )

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    // Switch to second question
    currentQuestion = Q2_ID
    mockCheckAnswer.mockResolvedValue({
      ...SUCCESS_RESULT,
      isCorrect: false,
      correctOptionId: OPT_B,
    })

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_B)
    })

    expect(result.current.feedback.get(Q1_ID)?.isCorrect).toBe(true)
    expect(result.current.feedback.get(Q2_ID)?.isCorrect).toBe(false)
  })
})
