import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerFeedback, DraftAnswer } from '../../types'

// ---- Mocks ----------------------------------------------------------------

const { mockHandleSubmitSession, mockHandleSaveSession, mockHandleDiscardSession } = vi.hoisted(
  () => ({
    mockHandleSubmitSession: vi.fn(),
    mockHandleSaveSession: vi.fn(),
    mockHandleDiscardSession: vi.fn(),
  }),
)

vi.mock('./quiz-submit', () => ({
  handleSubmitSession: (...args: unknown[]) => mockHandleSubmitSession(...args),
  handleSaveSession: (...args: unknown[]) => mockHandleSaveSession(...args),
  handleDiscardSession: (...args: unknown[]) => mockHandleDiscardSession(...args),
  // Pure URL builder — use the real behaviour so the safety-net assertions are meaningful.
  examReportUrl: (examMode: string | undefined, sessionId: string) =>
    `${examMode === 'internal_exam' ? '/app/internal-exam/report' : '/app/quiz/report'}?session=${sessionId}`,
}))

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

// jsdom's window.location is not fully writable, so replace it with a mockable stub.
// Held in a named ref because a vi.fn() reached only via Object.defineProperty is not in
// Vitest's mock registry, so vi.resetAllMocks() does not clear it — reset it explicitly.
const mockLocationAssign = vi.fn()
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { assign: mockLocationAssign },
})

// ---- Subject under test ---------------------------------------------------

import { NAV_FALLBACK_MS, useQuizSubmit } from './use-quiz-submit'

// ---- Fixtures ------------------------------------------------------------

const USER_ID = 'user-abc'
const SESSION_ID = 'sess-xyz'
const Q1 = 'q1'
const Q2 = 'q2'
const Q3 = 'q3'

function makeAnswersRef(entries: [string, DraftAnswer][]) {
  return { current: new Map(entries) }
}

function makeFeedbackRef(entries: [string, AnswerFeedback][] = []) {
  return { current: new Map(entries) }
}

function makePendingRef(ids: string[] = []) {
  return { current: new Set(ids) }
}

const SAMPLE_ANSWER: DraftAnswer = { selectedOptionId: 'opt-a', responseTimeMs: 500 }

function makeDefaultOpts(overrides?: Partial<Parameters<typeof useQuizSubmit>[0]>) {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    questions: [{ id: Q1 }, { id: Q2 }] as Parameters<typeof useQuizSubmit>[0]['questions'],
    answersRef: makeAnswersRef([[Q1, SAMPLE_ANSWER]]),
    feedbackRef: makeFeedbackRef(),
    currentIndexRef: { current: 0 },
    pendingQuestionIdRef: makePendingRef(),
    router: { push: mockRouterPush } as unknown as Parameters<typeof useQuizSubmit>[0]['router'],
    ...overrides,
  }
}

// ---- Lifecycle -----------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockLocationAssign.mockReset()
  mockHandleSubmitSession.mockResolvedValue(undefined)
  mockHandleSaveSession.mockResolvedValue(undefined)
  mockHandleDiscardSession.mockResolvedValue(undefined)
})

// ---- Initial state -------------------------------------------------------

describe('useQuizSubmit — initial state', () => {
  it('starts with submitting false and no error', () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    expect(result.current.submitting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('starts with showFinishDialog false', () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    expect(result.current.showFinishDialog).toBe(false)
  })

  it('exposes setShowFinishDialog to open the finish dialog', () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    act(() => result.current.setShowFinishDialog(true))
    expect(result.current.showFinishDialog).toBe(true)
  })
})

// ---- handleSubmit — pending answer filtering ----------------------------

describe('useQuizSubmit — handleSubmit pending answer filtering', () => {
  it('passes all answers when pending set is empty', async () => {
    const answersRef = makeAnswersRef([
      [Q1, SAMPLE_ANSWER],
      [Q2, { selectedOptionId: 'opt-b', responseTimeMs: 300 }],
    ])
    const pendingRef = makePendingRef([]) // empty

    const { result } = renderHook(() =>
      useQuizSubmit(makeDefaultOpts({ answersRef, pendingQuestionIdRef: pendingRef })),
    )

    await act(async () => result.current.handleSubmit())

    const call = mockHandleSubmitSession.mock.calls[0]?.[0] as { answers: Map<string, DraftAnswer> }
    expect([...call.answers.keys()]).toEqual([Q1, Q2])
  })

  it('excludes in-flight pending answers from the submitted map', async () => {
    const answersRef = makeAnswersRef([
      [Q1, SAMPLE_ANSWER],
      [Q2, { selectedOptionId: 'opt-b', responseTimeMs: 300 }],
      [Q3, { selectedOptionId: 'opt-c', responseTimeMs: 100 }],
    ])
    const pendingRef = makePendingRef([Q2]) // Q2 is still in flight

    const { result } = renderHook(() =>
      useQuizSubmit(makeDefaultOpts({ answersRef, pendingQuestionIdRef: pendingRef })),
    )

    await act(async () => result.current.handleSubmit())

    const call = mockHandleSubmitSession.mock.calls[0]?.[0] as { answers: Map<string, DraftAnswer> }
    expect([...call.answers.keys()]).toContain(Q1)
    expect([...call.answers.keys()]).toContain(Q3)
    expect([...call.answers.keys()]).not.toContain(Q2)
  })

  it('passes an empty map when all answers are pending', async () => {
    const answersRef = makeAnswersRef([[Q1, SAMPLE_ANSWER]])
    const pendingRef = makePendingRef([Q1]) // sole answer is pending

    const { result } = renderHook(() =>
      useQuizSubmit(makeDefaultOpts({ answersRef, pendingQuestionIdRef: pendingRef })),
    )

    await act(async () => result.current.handleSubmit())

    const call = mockHandleSubmitSession.mock.calls[0]?.[0] as { answers: Map<string, DraftAnswer> }
    expect(call.answers.size).toBe(0)
  })

  it('does not mutate the original answersRef map when pending set is non-empty', async () => {
    const originalMap = new Map<string, DraftAnswer>([
      [Q1, SAMPLE_ANSWER],
      [Q2, { selectedOptionId: 'opt-b', responseTimeMs: 300 }],
    ])
    const answersRef = { current: originalMap }
    const pendingRef = makePendingRef([Q2])

    const { result } = renderHook(() =>
      useQuizSubmit(makeDefaultOpts({ answersRef, pendingQuestionIdRef: pendingRef })),
    )

    await act(async () => result.current.handleSubmit())

    // Original map must still contain Q2
    expect(originalMap.has(Q2)).toBe(true)
  })
})

// ---- handleSubmit — delegates to handleSubmitSession --------------------

describe('useQuizSubmit — handleSubmit delegation', () => {
  it('submits with the userId and sessionId from opts', async () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    await act(async () => result.current.handleSubmit())

    const call = mockHandleSubmitSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.userId).toBe(USER_ID)
    expect(call.sessionId).toBe(SESSION_ID)
  })

  it('submits with the optional draftId from opts when provided', async () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts({ draftId: 'draft-99' })))
    await act(async () => result.current.handleSubmit())

    const call = mockHandleSubmitSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.draftId).toBe('draft-99')
  })
})

// ---- handleSave ----------------------------------------------------------

describe('useQuizSubmit — handleSave', () => {
  it('saves with the userId and sessionId from opts', async () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    await act(async () => result.current.handleSave())

    const call = mockHandleSaveSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.userId).toBe(USER_ID)
    expect(call.sessionId).toBe(SESSION_ID)
  })

  it('excludes pending answers from the saved map', async () => {
    const answers = new Map<string, DraftAnswer>([
      [Q1, SAMPLE_ANSWER],
      [Q2, { selectedOptionId: 'opt-b', responseTimeMs: 300 }],
    ])
    const { result } = renderHook(() =>
      useQuizSubmit(
        makeDefaultOpts({
          answersRef: { current: answers },
          pendingQuestionIdRef: makePendingRef([Q2]),
        }),
      ),
    )
    await act(async () => result.current.handleSave())

    const call = mockHandleSaveSession.mock.calls[0]?.[0] as Record<string, unknown>
    const saved = call.answers as Map<string, DraftAnswer>
    expect(saved.size).toBe(1)
    expect(saved.has(Q1)).toBe(true)
    expect(saved.has(Q2)).toBe(false)
  })

  it('passes all answers when pending set is empty', async () => {
    const answers = new Map<string, DraftAnswer>([[Q1, SAMPLE_ANSWER]])
    const ref = { current: answers }
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts({ answersRef: ref })))
    await act(async () => result.current.handleSave())

    const call = mockHandleSaveSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.answers).toBe(answers)
  })
})

// ---- handleDiscard -------------------------------------------------------

describe('useQuizSubmit — handleDiscard', () => {
  it('discards with the userId and sessionId from opts', async () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    await act(async () => result.current.handleDiscard())

    const call = mockHandleDiscardSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.userId).toBe(USER_ID)
    expect(call.sessionId).toBe(SESSION_ID)
  })
})

// ---- clearError ----------------------------------------------------------

describe('useQuizSubmit — clearError', () => {
  it('is exposed as a callable function', () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    expect(typeof result.current.clearError).toBe('function')
    expect(() => act(() => result.current.clearError())).not.toThrow()
  })
})

// ---- Synchronous re-entry guard for handleSubmit --------------------------

describe('useQuizSubmit — handleSubmit re-entry guard', () => {
  it('invokes the session handler once when timer and click fire simultaneously before the action resolves', async () => {
    // Never-resolving promise keeps the action in flight so the guard is exercised.
    mockHandleSubmitSession.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))

    await act(async () => {
      // Fire handleSubmit twice synchronously — second call must be suppressed.
      result.current.handleSubmit()
      result.current.handleSubmit()
    })

    expect(mockHandleSubmitSession).toHaveBeenCalledTimes(1)
  })

  it('allows a retry after a submit attempt finishes without succeeding', async () => {
    // Simulate an error path: action calls setSubmitting(true) then setSubmitting(false)
    // without calling onSuccess (submitted stays false → lock resets).
    let capturedSetSubmitting: ((v: boolean) => void) | undefined
    mockHandleSubmitSession.mockImplementation(
      async (opts: { setSubmitting: (v: boolean) => void }) => {
        capturedSetSubmitting = opts.setSubmitting
        opts.setSubmitting(true)
        opts.setSubmitting(false) // failure path — submitted.current is still false
      },
    )

    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))

    // First attempt — action signals failure.
    await act(async () => result.current.handleSubmit())
    expect(mockHandleSubmitSession).toHaveBeenCalledTimes(1)
    // Ensure the captured setter was exercised.
    expect(capturedSetSubmitting).toBeDefined()

    // Lock should be reset — second attempt must go through.
    await act(async () => result.current.handleSubmit())
    expect(mockHandleSubmitSession).toHaveBeenCalledTimes(2)
  })

  it('allows a retry after a submit attempt rejects', async () => {
    // Throw path: the action rejects before ever calling setSubmitting(false), so the
    // lock can only be released by the finally handler (submitted stays false → retryable).
    mockHandleSubmitSession
      .mockImplementationOnce(async () => {
        throw new Error('network')
      })
      .mockImplementationOnce(async () => {})

    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))

    // First attempt rejects — swallow so act() doesn't surface the rejection.
    await act(async () => {
      await result.current.handleSubmit()?.catch(() => {})
    })
    expect(mockHandleSubmitSession).toHaveBeenCalledTimes(1)

    // Lock released by finally → second attempt must go through.
    await act(async () => result.current.handleSubmit())
    expect(mockHandleSubmitSession).toHaveBeenCalledTimes(2)
  })

  it('remains locked after success so a concurrent timer fire does not double-submit', async () => {
    // Simulate success path: onSuccess sets submitted.current = true, then the action
    // navigates away without calling setSubmitting(false).
    mockHandleSubmitSession.mockImplementation(async (opts: { onSuccess: () => void }) => {
      opts.onSuccess() // sets submitted.current = true
      // No setSubmitting(false) on success — terminal path.
    })

    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))

    await act(async () => result.current.handleSubmit())
    expect(mockHandleSubmitSession).toHaveBeenCalledTimes(1)

    // A second call after success must be suppressed (both submitted and inFlight guard it).
    await act(async () => result.current.handleSubmit())
    expect(mockHandleSubmitSession).toHaveBeenCalledTimes(1)
  })
})

// ---- pendingAction discriminator -----------------------------------------

// The session functions are mocked, so they only flip pendingAction if the mock
// actually invokes the setSubmitting it receives. A bare mockResolvedValue would
// never call it — the assertions below would pass vacuously — so each test drives
// setSubmitting explicitly to exercise the discriminator wiring.
type SessionOpts = { setSubmitting: (v: boolean) => void }

describe('useQuizSubmit — pendingAction discriminator', () => {
  it('starts with pendingAction null', () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    expect(result.current.pendingAction).toBeNull()
  })

  it('reports pendingAction "submit" (and submitting true) while a submit is in flight', async () => {
    mockHandleSubmitSession.mockImplementation(async (opts: SessionOpts) =>
      opts.setSubmitting(true),
    )
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    await act(async () => result.current.handleSubmit())
    expect(result.current.pendingAction).toBe('submit')
    expect(result.current.submitting).toBe(true)
  })

  it('reports pendingAction "save" while a save is in flight and clears it on completion', async () => {
    let setSubmitting: ((v: boolean) => void) | undefined
    mockHandleSaveSession.mockImplementation(async (opts: SessionOpts) => {
      setSubmitting = opts.setSubmitting
      opts.setSubmitting(true)
    })
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    await act(async () => result.current.handleSave())
    expect(result.current.pendingAction).toBe('save')

    act(() => setSubmitting?.(false))
    expect(result.current.pendingAction).toBeNull()
    expect(result.current.submitting).toBe(false)
  })

  it('reports pendingAction "discard" while a discard is in flight', async () => {
    mockHandleDiscardSession.mockImplementation(async (opts: SessionOpts) =>
      opts.setSubmitting(true),
    )
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    await act(async () => result.current.handleDiscard())
    expect(result.current.pendingAction).toBe('discard')
  })
})

// ---- handleSubmit — navigation safety net (#909) -------------------------

type SubmitOpts = { onSuccess: () => void }

describe('useQuizSubmit — navigation safety net', () => {
  it('navigates to the report when the soft navigation stalls after submitting', async () => {
    vi.useFakeTimers()
    try {
      mockHandleSubmitSession.mockImplementation(async (opts: SubmitOpts) => opts.onSuccess())
      const { result } = renderHook(() =>
        useQuizSubmit(makeDefaultOpts({ examMode: 'internal_exam' })),
      )
      await act(async () => result.current.handleSubmit())

      act(() => {
        vi.advanceTimersByTime(NAV_FALLBACK_MS + 1)
      })
      expect(window.location.assign).toHaveBeenCalledWith(
        `/app/internal-exam/report?session=${SESSION_ID}`,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not redirect again after the student leaves the session page', async () => {
    vi.useFakeTimers()
    try {
      mockHandleSubmitSession.mockImplementation(async (opts: SubmitOpts) => opts.onSuccess())
      const { result, unmount } = renderHook(() =>
        useQuizSubmit(makeDefaultOpts({ examMode: 'internal_exam' })),
      )
      await act(async () => result.current.handleSubmit())

      unmount()
      act(() => {
        vi.advanceTimersByTime(NAV_FALLBACK_MS + 1)
      })
      expect(window.location.assign).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not navigate to the report when submission fails', async () => {
    vi.useFakeTimers()
    try {
      // Failure path: handleSubmitSession never calls onSuccess.
      mockHandleSubmitSession.mockResolvedValue(undefined)
      const { result } = renderHook(() =>
        useQuizSubmit(makeDefaultOpts({ examMode: 'internal_exam' })),
      )
      await act(async () => result.current.handleSubmit())

      act(() => {
        vi.advanceTimersByTime(NAV_FALLBACK_MS + 1)
      })
      expect(window.location.assign).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
