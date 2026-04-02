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
}))

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

// ---- Subject under test ---------------------------------------------------

import { useQuizSubmit } from './use-quiz-submit'

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
  it('forwards userId and sessionId to handleSubmitSession', async () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts()))
    await act(async () => result.current.handleSubmit())

    const call = mockHandleSubmitSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.userId).toBe(USER_ID)
    expect(call.sessionId).toBe(SESSION_ID)
  })

  it('forwards optional draftId to handleSubmitSession', async () => {
    const { result } = renderHook(() => useQuizSubmit(makeDefaultOpts({ draftId: 'draft-99' })))
    await act(async () => result.current.handleSubmit())

    const call = mockHandleSubmitSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.draftId).toBe('draft-99')
  })
})

// ---- handleSave ----------------------------------------------------------

describe('useQuizSubmit — handleSave', () => {
  it('delegates to handleSaveSession with userId and sessionId', async () => {
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
  it('delegates to handleDiscardSession with userId and sessionId', async () => {
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
