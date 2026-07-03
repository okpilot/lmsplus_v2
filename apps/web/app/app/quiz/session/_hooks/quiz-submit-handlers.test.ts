import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionQuestion } from '@/app/app/_types/session'
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
  examReportUrl: (examMode: string | undefined, sessionId: string) =>
    `${examMode === 'internal_exam' ? '/app/internal-exam/report' : '/app/quiz/report'}?session=${sessionId}`,
}))

// ---- Subject under test ---------------------------------------------------

import {
  buildHandleDiscard,
  buildHandleSave,
  buildHandleSubmit,
  buildSharedFor,
} from './quiz-submit-handlers'

// ---- Fixtures ---------------------------------------------------------------

const USER_ID = 'user-abc'
const SESSION_ID = 'sess-xyz'

function makeBaseDeps(overrides: Partial<Parameters<typeof buildSharedFor>[0]> = {}) {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    router: { push: vi.fn() } as unknown as Parameters<typeof buildSharedFor>[0]['router'],
    draftId: undefined,
    setPendingAction: vi.fn(),
    setError: vi.fn(),
    submitted: { current: false },
    inFlight: { current: false },
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockHandleSubmitSession.mockResolvedValue(undefined)
  mockHandleSaveSession.mockResolvedValue(undefined)
  mockHandleDiscardSession.mockResolvedValue(undefined)
})

// ---- buildSharedFor — setSubmitting → pendingAction mapping ----------------

describe('buildSharedFor', () => {
  it('maps setSubmitting(true) to setPendingAction(action)', () => {
    const deps = makeBaseDeps()
    const sharedFor = buildSharedFor(deps)
    sharedFor('submit').setSubmitting(true)
    expect(deps.setPendingAction).toHaveBeenCalledWith('submit')
  })

  it('maps setSubmitting(false) to setPendingAction(null)', () => {
    const deps = makeBaseDeps()
    const sharedFor = buildSharedFor(deps)
    sharedFor('save').setSubmitting(false)
    expect(deps.setPendingAction).toHaveBeenCalledWith(null)
  })

  it('forwards router and setError from deps unchanged', () => {
    const deps = makeBaseDeps()
    const sharedFor = buildSharedFor(deps)
    const bundle = sharedFor('discard')
    expect(bundle.router).toBe(deps.router)
    expect(bundle.setError).toBe(deps.setError)
  })

  // ---- submit-only inFlight reset -------------------------------------------

  it('resets inFlight.current to false on a submit setSubmitting(false) when not yet submitted', () => {
    const deps = makeBaseDeps({ inFlight: { current: true }, submitted: { current: false } })
    const sharedFor = buildSharedFor(deps)
    sharedFor('submit').setSubmitting(false)
    expect(deps.inFlight.current).toBe(false)
  })

  it('does NOT reset inFlight.current on a submit setSubmitting(false) after success (submitted=true)', () => {
    const deps = makeBaseDeps({ inFlight: { current: true }, submitted: { current: true } })
    const sharedFor = buildSharedFor(deps)
    sharedFor('submit').setSubmitting(false)
    expect(deps.inFlight.current).toBe(true)
  })

  it('does NOT touch inFlight.current for a save action, even when setSubmitting(false)', () => {
    const deps = makeBaseDeps({ inFlight: { current: true }, submitted: { current: false } })
    const sharedFor = buildSharedFor(deps)
    sharedFor('save').setSubmitting(false)
    expect(deps.inFlight.current).toBe(true)
  })

  it('does NOT touch inFlight.current for a discard action, even when setSubmitting(false)', () => {
    const deps = makeBaseDeps({ inFlight: { current: true }, submitted: { current: false } })
    const sharedFor = buildSharedFor(deps)
    sharedFor('discard').setSubmitting(false)
    expect(deps.inFlight.current).toBe(true)
  })

  it('does not reset inFlight.current on setSubmitting(true) for submit', () => {
    const deps = makeBaseDeps({ inFlight: { current: true }, submitted: { current: false } })
    const sharedFor = buildSharedFor(deps)
    sharedFor('submit').setSubmitting(true)
    expect(deps.inFlight.current).toBe(true)
  })
})

// ---- buildHandleSubmit ------------------------------------------------------

describe('buildHandleSubmit', () => {
  function makeSubmitDeps(overrides = {}) {
    return {
      ...makeBaseDeps(),
      answersRef: {
        current: new Map<string, DraftAnswer>([
          ['q1', { selectedOptionId: 'a', responseTimeMs: 1 }],
        ]),
      },
      pendingQuestionIdRef: { current: new Set<string>() },
      navFallbackTimer: { current: null as ReturnType<typeof setTimeout> | null },
      setShowFinishDialog: vi.fn(),
      ...overrides,
    }
  }

  it('delegates to handleSubmitSession with userId/sessionId', async () => {
    const deps = makeSubmitDeps()
    const handleSubmit = buildHandleSubmit(deps)
    await handleSubmit()
    const call = mockHandleSubmitSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.userId).toBe(USER_ID)
    expect(call.sessionId).toBe(SESSION_ID)
  })

  it('is a no-op when inFlight is already true', async () => {
    const deps = makeSubmitDeps({ inFlight: { current: true } })
    const handleSubmit = buildHandleSubmit(deps)
    await handleSubmit()
    expect(mockHandleSubmitSession).not.toHaveBeenCalled()
  })

  it('is a no-op when already submitted', async () => {
    const deps = makeSubmitDeps({ submitted: { current: true } })
    const handleSubmit = buildHandleSubmit(deps)
    await handleSubmit()
    expect(mockHandleSubmitSession).not.toHaveBeenCalled()
  })

  it('excludes pending question ids from the submitted answers', async () => {
    const deps = makeSubmitDeps({
      answersRef: {
        current: new Map<string, DraftAnswer>([
          ['q1', { selectedOptionId: 'a', responseTimeMs: 1 }],
          ['q2', { selectedOptionId: 'b', responseTimeMs: 2 }],
        ]),
      },
      pendingQuestionIdRef: { current: new Set(['q2']) },
    })
    const handleSubmit = buildHandleSubmit(deps)
    await handleSubmit()
    const call = mockHandleSubmitSession.mock.calls[0]?.[0] as { answers: Map<string, DraftAnswer> }
    expect([...call.answers.keys()]).toEqual(['q1'])
  })
})

// ---- buildHandleSave ---------------------------------------------------------

describe('buildHandleSave', () => {
  function makeSaveDeps(overrides = {}) {
    return {
      ...makeBaseDeps(),
      questions: [{ id: 'q1' }] as SessionQuestion[],
      answersRef: {
        current: new Map<string, DraftAnswer>([
          ['q1', { selectedOptionId: 'a', responseTimeMs: 1 }],
        ]),
      },
      feedbackRef: { current: new Map<string, AnswerFeedback>() },
      currentIndexRef: { current: 0 },
      pendingQuestionIdRef: { current: new Set<string>() },
      ...overrides,
    }
  }

  it('delegates to handleSaveSession with userId/sessionId', async () => {
    const deps = makeSaveDeps()
    const handleSave = buildHandleSave(deps)
    await handleSave()
    const call = mockHandleSaveSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.userId).toBe(USER_ID)
    expect(call.sessionId).toBe(SESSION_ID)
  })

  it('excludes pending question ids from the saved answers', async () => {
    const deps = makeSaveDeps({ pendingQuestionIdRef: { current: new Set(['q1']) } })
    const handleSave = buildHandleSave(deps)
    await handleSave()
    const call = mockHandleSaveSession.mock.calls[0]?.[0] as { answers: Map<string, DraftAnswer> }
    expect(call.answers.size).toBe(0)
  })
})

// ---- buildHandleDiscard -------------------------------------------------------

describe('buildHandleDiscard', () => {
  it('delegates to handleDiscardSession with userId/sessionId/draftId', async () => {
    const deps = makeBaseDeps({ draftId: 'draft-1' })
    const handleDiscard = buildHandleDiscard(deps)
    await handleDiscard()
    const call = mockHandleDiscardSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.userId).toBe(USER_ID)
    expect(call.sessionId).toBe(SESSION_ID)
    expect(call.draftId).toBe('draft-1')
  })
})
