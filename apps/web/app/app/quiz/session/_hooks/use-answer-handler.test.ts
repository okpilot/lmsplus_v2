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

// ---- onAnswerRecorded callback --------------------------------------------

describe('useAnswerHandler — onAnswerRecorded callback', () => {
  it('calls onAnswerRecorded with the updated answers map after a successful check', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const onAnswerRecorded = vi.fn()

    let answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      answers = updater(answers)
    })

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        onAnswerRecorded,
      }),
    )

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(onAnswerRecorded).toHaveBeenCalledTimes(1)
    const calledWith = onAnswerRecorded.mock.calls[0]?.[0] as Map<string, unknown>
    expect(calledWith).toBeInstanceOf(Map)
    expect((calledWith.get(Q1_ID) as { selectedOptionId: string })?.selectedOptionId).toBe(OPT_A)
  })

  it('passes the updated feedback map as the second argument to onAnswerRecorded', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const onAnswerRecorded = vi.fn()

    let answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      answers = updater(answers)
    })

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        onAnswerRecorded,
      }),
    )

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(onAnswerRecorded).toHaveBeenCalledTimes(1)
    const feedbackArg = onAnswerRecorded.mock.calls[0]?.[1] as Map<string, unknown>
    expect(feedbackArg).toBeInstanceOf(Map)
    const entry = feedbackArg.get(Q1_ID) as {
      isCorrect: boolean
      correctOptionId: string
    }
    expect(entry?.isCorrect).toBe(true)
    expect(entry?.correctOptionId).toBe(OPT_A)
  })

  it('does not call onAnswerRecorded when checkAnswer fails', async () => {
    mockCheckAnswer.mockRejectedValue(new Error('network error'))
    const onAnswerRecorded = vi.fn()

    const answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) =>
      updater(answers),
    )

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        onAnswerRecorded,
      }),
    )

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(onAnswerRecorded).not.toHaveBeenCalled()
  })

  it('works correctly when onAnswerRecorded is not provided', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const { result } = renderAnswerHandler()

    // Must not reject when the optional callback is absent
    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })
  })

  it('keeps the confirmed answer when the checkpoint callback throws', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const throwingCallback = vi.fn(() => {
      throw new Error('sessionStorage quota exceeded')
    })

    let answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      answers = updater(answers)
    })

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        onAnswerRecorded: throwingCallback,
      }),
    )

    let returnValue: boolean | undefined
    await act(async () => {
      returnValue = await result.current.handleSelectAnswer(OPT_A)
    })

    // Checkpoint failure must not roll back the confirmed answer
    expect(answers.has(Q1_ID)).toBe(true)
    expect(answers.get(Q1_ID)?.selectedOptionId).toBe(OPT_A)
    // The answer was confirmed by the server, so the return value must still be true
    expect(returnValue).toBe(true)
    // Feedback must still be set — the answer was correct
    expect(result.current.feedback.get(Q1_ID)?.isCorrect).toBe(true)
    // No error surfaced to the user — checkpoint failure is silent
    expect(result.current.error).toBeNull()
  })
})

// ---- onAnswerReverted callback --------------------------------------------

describe('useAnswerHandler — onAnswerReverted callback', () => {
  it('calls onAnswerReverted with the reverted answers map when checkAnswer fails', async () => {
    mockCheckAnswer.mockRejectedValue(new Error('network error'))
    const onAnswerReverted = vi.fn()

    let answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      answers = updater(answers)
    })

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        onAnswerReverted,
      }),
    )

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(onAnswerReverted).toHaveBeenCalledTimes(1)
    const calledWith = onAnswerReverted.mock.calls[0]?.[0] as Map<string, unknown>
    expect(calledWith).toBeInstanceOf(Map)
    // The reverted map must NOT contain the failed answer
    expect(calledWith.has(Q1_ID)).toBe(false)
  })

  it('does not call onAnswerReverted when checkAnswer succeeds', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const onAnswerReverted = vi.fn()

    let answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      answers = updater(answers)
    })

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        onAnswerReverted,
      }),
    )

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(onAnswerReverted).not.toHaveBeenCalled()
  })

  it('does not throw when onAnswerReverted is not provided and checkAnswer fails', async () => {
    mockCheckAnswer.mockRejectedValue(new Error('network error'))
    const { result } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })
  })

  it('keeps the error message and does not rethrow when the revert callback throws', async () => {
    mockCheckAnswer.mockRejectedValue(new Error('network error'))
    const throwingRevertCallback = vi.fn(() => {
      throw new Error('sessionStorage quota exceeded')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    let answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      answers = updater(answers)
    })

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        onAnswerReverted: throwingRevertCallback,
      }),
    )

    let returnValue: boolean | undefined
    await act(async () => {
      returnValue = await result.current.handleSelectAnswer(OPT_A)
    })

    // Return value still false — the server rejected the answer
    expect(returnValue).toBe(false)
    // User-facing error is still set
    expect(result.current.error).toBe('Failed to check answer. Please try again.')
    // Callback failure is warned, not rethrown
    expect(warnSpy).toHaveBeenCalledWith(
      '[use-answer-handler] Revert checkpoint failed (best-effort):',
      expect.any(Error),
    )
    warnSpy.mockRestore()
  })
})

// ---- clearError -----------------------------------------------------------

describe('useAnswerHandler — clearError', () => {
  it('clears the error state when clearError is called', async () => {
    mockCheckAnswer.mockRejectedValue(new Error('network error'))
    const { result } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })
    expect(result.current.error).toBe('Failed to check answer. Please try again.')

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
  })

  it('is safe to call clearError when no error is set', () => {
    const { result } = renderAnswerHandler()

    // No error has been set — calling clearError must not throw
    expect(() => act(() => result.current.clearError())).not.toThrow()
    expect(result.current.error).toBeNull()
  })
})

// ---- handleSelectAnswer return value -------------------------------------

describe('useAnswerHandler — handleSelectAnswer return value', () => {
  it('returns true after a successful answer', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const { result } = renderAnswerHandler()

    let returnValue: boolean | undefined
    await act(async () => {
      returnValue = await result.current.handleSelectAnswer(OPT_A)
    })

    expect(returnValue).toBe(true)
  })

  it('returns false when the question is already answered', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const { result, getAnswers } = renderAnswerHandler()

    // Answer first time
    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    // Re-render with updated answers so the hook sees the answered state
    const answeredAnswers = getAnswers()
    let returnValue: boolean | undefined
    const { result: result2 } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers: answeredAnswers,
        setAnswers: vi.fn() as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
      }),
    )
    await act(async () => {
      returnValue = await result2.current.handleSelectAnswer(OPT_B)
    })

    expect(returnValue).toBe(false)
  })

  it('returns false when checkAnswer fails', async () => {
    mockCheckAnswer.mockRejectedValue(new Error('network error'))
    const { result } = renderAnswerHandler()

    let returnValue: boolean | undefined
    await act(async () => {
      returnValue = await result.current.handleSelectAnswer(OPT_A)
    })

    expect(returnValue).toBe(false)
  })
})

// ---- initialFeedback seeding ------------------------------------------------

describe('useAnswerHandler — initialFeedback', () => {
  it('pre-populates the feedback map from initialFeedback on mount', () => {
    const seedFeedback = new Map([
      [
        Q1_ID,
        {
          isCorrect: true,
          correctOptionId: OPT_A,
          explanationText: 'Seed explanation',
          explanationImageUrl: null,
        },
      ],
    ])

    let answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>([
      [Q1_ID, { selectedOptionId: OPT_A, responseTimeMs: 800 }],
    ])
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      answers = updater(answers)
    })

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        initialFeedback: seedFeedback,
      }),
    )

    const fb = result.current.feedback.get(Q1_ID)
    expect(fb?.isCorrect).toBe(true)
    expect(fb?.correctOptionId).toBe(OPT_A)
    expect(fb?.explanationText).toBe('Seed explanation')
  })

  it('returns pre-seeded feedback immediately without a new answer submission', () => {
    const seedFeedback = new Map([
      [
        Q2_ID,
        {
          isCorrect: false,
          correctOptionId: OPT_B,
          explanationText: null,
          explanationImageUrl: null,
        },
      ],
    ])

    const answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>([
      [Q2_ID, { selectedOptionId: OPT_A, responseTimeMs: 600 }],
    ])
    const setAnswers = vi.fn()

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q2_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        initialFeedback: seedFeedback,
      }),
    )

    // No handleSelectAnswer call — feedback comes purely from initialFeedback
    expect(mockCheckAnswer).not.toHaveBeenCalled()
    const fb = result.current.feedback.get(Q2_ID)
    expect(fb?.isCorrect).toBe(false)
    expect(fb?.correctOptionId).toBe(OPT_B)
  })

  it('starts with an empty feedback map when initialFeedback is not provided', () => {
    const { result } = renderAnswerHandler()

    expect(result.current.feedback.size).toBe(0)
  })
})

// ---- feedbackRef eager update ------------------------------------------------

describe('useAnswerHandler — feedbackRef is updated eagerly before setFeedback', () => {
  it('passes up-to-date feedback to onAnswerRecorded even when called inside the same tick as setFeedback', async () => {
    // The bug this guards against: if feedbackRef was only updated via the state-driven
    // useEffect, a callback fired synchronously after setFeedback could see stale feedback.
    // The fix sets feedbackRef.current = nextFeedback before calling setFeedback.
    //
    // Observable behaviour: onAnswerRecorded receives the full nextFeedback map (including
    // the entry for this question) as its second argument. If feedbackRef was stale,
    // it would receive an empty or old map.
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const capturedFeedback: Map<string, unknown>[] = []
    const onAnswerRecorded = vi.fn((_answers: unknown, feedback: Map<string, unknown>) => {
      capturedFeedback.push(new Map(feedback))
    })

    let answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      answers = updater(answers)
    })

    const { result } = renderHook(() =>
      useAnswerHandler({
        sessionId: SESSION_ID,
        getQuestionId: () => Q1_ID,
        getAnswerStartTime: () => Date.now() - 500,
        answers,
        setAnswers: setAnswers as React.Dispatch<
          React.SetStateAction<Map<string, { selectedOptionId: string; responseTimeMs: number }>>
        >,
        onAnswerRecorded,
      }),
    )

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(capturedFeedback).toHaveLength(1)
    const fb = capturedFeedback[0]
    expect(fb?.has(Q1_ID)).toBe(true)
    expect((fb?.get(Q1_ID) as { isCorrect: boolean } | undefined)?.isCorrect).toBe(true)
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

// ---- pendingQuestionIdRef lifecycle ------------------------------------------

describe('useAnswerHandler — pendingQuestionIdRef lifecycle', () => {
  it('starts as an empty set before any answer is selected', () => {
    const { result } = renderAnswerHandler()
    expect(result.current.pendingQuestionIdRef.current.size).toBe(0)
  })

  it('holds the questionId while checkAnswer is in-flight', async () => {
    // Deferred promise — checkAnswer never resolves until we say so
    let resolveCheckAnswer!: (v: typeof SUCCESS_RESULT) => void
    mockCheckAnswer.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCheckAnswer = resolve
        }),
    )

    const { result } = renderAnswerHandler()

    // Start answering — do NOT await; the ref should be set before checkAnswer resolves
    act(() => {
      result.current.handleSelectAnswer(OPT_A)
    })

    // At this point checkAnswer is in-flight — ref must contain the questionId
    expect(result.current.pendingQuestionIdRef.current.has(Q1_ID)).toBe(true)

    // Resolve so the hook can clean up
    await act(async () => {
      resolveCheckAnswer(SUCCESS_RESULT)
    })
  })

  it('is cleared after a successful checkAnswer', async () => {
    mockCheckAnswer.mockResolvedValue(SUCCESS_RESULT)
    const { result } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(result.current.pendingQuestionIdRef.current.size).toBe(0)
  })

  it('is cleared after a failed checkAnswer', async () => {
    mockCheckAnswer.mockRejectedValue(new Error('network error'))
    const { result } = renderAnswerHandler()

    await act(async () => {
      await result.current.handleSelectAnswer(OPT_A)
    })

    expect(result.current.pendingQuestionIdRef.current.size).toBe(0)
  })

  it('keeps Q2 pending when Q1 fails while both are in-flight', async () => {
    // Two deferred promises: Q1 will reject, Q2 stays unresolved throughout the assertion
    let rejectQ1!: (err: Error) => void
    let resolveQ2!: (v: typeof SUCCESS_RESULT) => void

    mockCheckAnswer
      .mockImplementationOnce(
        () =>
          new Promise<typeof SUCCESS_RESULT>((_, reject) => {
            rejectQ1 = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<typeof SUCCESS_RESULT>((resolve) => {
            resolveQ2 = resolve
          }),
      )

    // Hook with a mutable question-ID getter so we can switch from Q1 to Q2
    let currentQuestion = Q1_ID
    const answers = new Map<string, { selectedOptionId: string; responseTimeMs: number }>()
    const setAnswers = vi.fn((updater: (prev: typeof answers) => typeof answers) => {
      const next = updater(answers)
      for (const [k, v] of next) answers.set(k, v)
      // Reflect deletions too
      for (const k of answers.keys()) {
        if (!next.has(k)) answers.delete(k)
      }
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

    // Fire Q1 — leaves checkAnswer in-flight
    act(() => {
      result.current.handleSelectAnswer(OPT_A)
    })

    // Switch to Q2 and fire its answer — also in-flight
    currentQuestion = Q2_ID
    act(() => {
      result.current.handleSelectAnswer(OPT_B)
    })

    // Both answers are now pending
    expect(result.current.pendingQuestionIdRef.current.has(Q1_ID)).toBe(true)
    expect(result.current.pendingQuestionIdRef.current.has(Q2_ID)).toBe(true)

    // Reject Q1 — only Q1 should leave the set
    await act(async () => {
      rejectQ1(new Error('network error'))
    })

    expect(result.current.pendingQuestionIdRef.current.has(Q1_ID)).toBe(false)
    expect(result.current.pendingQuestionIdRef.current.has(Q2_ID)).toBe(true)

    // Resolve Q2 so the hook cleans up
    await act(async () => {
      resolveQ2(SUCCESS_RESULT)
    })

    expect(result.current.pendingQuestionIdRef.current.size).toBe(0)
  })
})
