import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSaveDraft,
  mockDiscardQuiz,
  mockClearDeploymentPin,
  mockClearActiveSession,
  mockSessionStorageSetItem,
} = vi.hoisted(() => ({
  mockSaveDraft: vi.fn<() => Promise<{ success: true } | { success: false; error: string }>>(),
  mockDiscardQuiz: vi.fn<() => Promise<{ success: true } | { success: false; error: string }>>(),
  mockClearDeploymentPin: vi.fn<() => Promise<void>>(),
  mockClearActiveSession: vi.fn<(userId: string) => void>(),
  mockSessionStorageSetItem: vi.fn<(key: string, value: string) => void>(),
}))

vi.mock('../actions/draft', () => ({ saveDraft: mockSaveDraft }))
vi.mock('../actions/discard', () => ({ discardQuiz: mockDiscardQuiz }))
vi.mock('../actions/clear-deployment-pin', () => ({
  clearDeploymentPin: mockClearDeploymentPin,
}))
vi.mock('../session/_utils/quiz-session-storage', () => ({
  clearActiveSession: mockClearActiveSession,
  sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
  buildHandoffPayload: (_userId: string, session: unknown) => session,
}))

import type { ActiveSession } from '../session/_utils/quiz-session-storage'
import { buildDiscardHandler, buildResumeHandler, buildSaveHandler } from './quiz-recovery-handlers'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    userId: 'user-1',
    sessionId: 'sess-abc',
    questionIds: ['q1', 'q2'],
    answers: {},
    currentIndex: 0,
    savedAt: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Shared stubs
// ---------------------------------------------------------------------------

let setError: ReturnType<typeof vi.fn<(v: string | null) => void>>
let setSession: ReturnType<typeof vi.fn<(v: ActiveSession | null) => void>>
let setLoading: ReturnType<typeof vi.fn<(v: boolean) => void>>
// Router param type taken straight from the builder so the mock satisfies the full
// AppRouterInstance shape (push/refresh are used; back/forward/replace/prefetch are stubs).
let router: Parameters<typeof buildResumeHandler>[3]

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      setItem: mockSessionStorageSetItem,
      getItem: vi.fn(),
      removeItem: vi.fn(),
    },
    writable: true,
  })
  setError = vi.fn()
  setSession = vi.fn()
  setLoading = vi.fn()
  router = {
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }
  mockClearDeploymentPin.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// buildResumeHandler
// ---------------------------------------------------------------------------

describe('buildResumeHandler', () => {
  it('does nothing when there is no active session', () => {
    const handle = buildResumeHandler('user-1', null, setError, router)
    handle()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('sets an error and does not navigate when sessionStorage write fails', () => {
    const session = makeSession()
    mockSessionStorageSetItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const handle = buildResumeHandler('user-1', session, setError, router)
    handle()

    expect(setError).toHaveBeenCalledWith('Unable to resume right now. Please try again.')
    expect(router.push).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('clears the active session and navigates to the quiz session page on success', () => {
    const session = makeSession()
    const handle = buildResumeHandler('user-1', session, setError, router)
    handle()

    expect(mockClearActiveSession).toHaveBeenCalledWith('user-1')
    expect(router.push).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('does not set an error on success', () => {
    const session = makeSession()
    const handle = buildResumeHandler('user-1', session, setError, router)
    handle()

    expect(setError).not.toHaveBeenCalled()
  })

  it('writes the handoff payload under the user-scoped key', () => {
    const session = makeSession({ userId: 'user-42' })

    buildResumeHandler('user-42', session, setError, router)()

    // Key must be scoped to the user
    expect(mockSessionStorageSetItem.mock.calls[0]?.[0]).toBe('quiz-session:user-42')
  })
})

// ---------------------------------------------------------------------------
// buildSaveHandler
// ---------------------------------------------------------------------------

describe('buildSaveHandler', () => {
  it('does nothing when already loading', async () => {
    const session = makeSession()
    const handle = buildSaveHandler(
      'user-1',
      session,
      /* loading */ true,
      setLoading,
      setError,
      setSession,
      router,
    )
    await handle()
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it('does nothing when there is no active session', async () => {
    const handle = buildSaveHandler(
      'user-1',
      /* session */ null,
      /* loading */ false,
      setLoading,
      setError,
      setSession,
      router,
    )
    await handle()
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it('clears the session and refreshes the page when the draft is saved successfully', async () => {
    const session = makeSession()
    mockSaveDraft.mockResolvedValue({ success: true })

    const handle = buildSaveHandler(
      'user-1',
      session,
      false,
      setLoading,
      setError,
      setSession,
      router,
    )
    await handle()

    expect(mockClearActiveSession).toHaveBeenCalledWith('user-1')
    expect(router.refresh).toHaveBeenCalled()
    expect(setSession).toHaveBeenCalledWith(null)
  })

  it('sets loading false after a successful save', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })
    const session = makeSession()

    const handle = buildSaveHandler(
      'user-1',
      session,
      false,
      setLoading,
      setError,
      setSession,
      router,
    )
    await handle()

    // setLoading(true) then setLoading(false) via finally
    expect(setLoading).toHaveBeenNthCalledWith(1, true)
    expect(setLoading).toHaveBeenNthCalledWith(2, false)
  })

  it('shows the server error message when the draft save returns failure', async () => {
    mockSaveDraft.mockResolvedValue({ success: false, error: 'Failed to save draft' })
    const session = makeSession()

    const handle = buildSaveHandler(
      'user-1',
      session,
      false,
      setLoading,
      setError,
      setSession,
      router,
    )
    await handle()

    expect(setError).toHaveBeenCalledWith('Failed to save draft')
    expect(router.refresh).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('shows a generic message when the save result has no error string', async () => {
    // success: false with no error field — the ?? fallback must kick in
    mockSaveDraft.mockResolvedValue({ success: false, error: undefined as unknown as string })
    const session = makeSession()

    const handle = buildSaveHandler(
      'user-1',
      session,
      false,
      setLoading,
      setError,
      setSession,
      router,
    )
    await handle()

    expect(setError).toHaveBeenCalledWith('Failed to save. Please try again.')
  })

  it('shows a server-unavailable message when saveDraft throws', async () => {
    mockSaveDraft.mockRejectedValue(new Error('network error'))
    const session = makeSession()

    const handle = buildSaveHandler(
      'user-1',
      session,
      false,
      setLoading,
      setError,
      setSession,
      router,
    )
    await handle()

    expect(setError).toHaveBeenCalledWith('Server unavailable. Please try again later.')
  })

  it('always resets the loading state even when an error is thrown', async () => {
    mockSaveDraft.mockRejectedValue(new Error('boom'))
    const session = makeSession()

    const handle = buildSaveHandler(
      'user-1',
      session,
      false,
      setLoading,
      setError,
      setSession,
      router,
    )
    await handle()

    expect(setLoading).toHaveBeenLastCalledWith(false)
  })

  it('clears the error state at the start of each attempt', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })
    const session = makeSession()

    const handle = buildSaveHandler(
      'user-1',
      session,
      false,
      setLoading,
      setError,
      setSession,
      router,
    )
    await handle()

    // First call to setError must be null (clear)
    expect(setError).toHaveBeenNthCalledWith(1, null)
  })
})

// ---------------------------------------------------------------------------
// buildDiscardHandler
// ---------------------------------------------------------------------------

describe('buildDiscardHandler', () => {
  it('does nothing when already loading', () => {
    const session = makeSession()
    const handle = buildDiscardHandler('user-1', session, /* loading */ true, setSession)
    handle()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
  })

  it('clears the active session and nulls the UI state when not loading', () => {
    const session = makeSession()
    mockDiscardQuiz.mockResolvedValue({ success: true })

    const handle = buildDiscardHandler('user-1', session, false, setSession)
    handle()

    expect(mockClearActiveSession).toHaveBeenCalledWith('user-1')
    expect(setSession).toHaveBeenCalledWith(null)
  })

  it('fires the discard server action with the session and draft ids', () => {
    const session = makeSession({ sessionId: 'sess-xyz', draftId: 'draft-123' })
    mockDiscardQuiz.mockResolvedValue({ success: true })

    const handle = buildDiscardHandler('user-1', session, false, setSession)
    handle()

    expect(mockDiscardQuiz).toHaveBeenCalledWith({
      sessionId: 'sess-xyz',
      draftId: 'draft-123',
    })
  })

  it('does not call the discard server action when there is no session', () => {
    const handle = buildDiscardHandler('user-1', null, false, setSession)
    handle()

    expect(mockDiscardQuiz).not.toHaveBeenCalled()
    // clearActiveSession and setSession still run
    expect(mockClearActiveSession).toHaveBeenCalledWith('user-1')
    expect(setSession).toHaveBeenCalledWith(null)
  })
})
