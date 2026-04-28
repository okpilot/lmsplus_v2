/**
 * Tests for the pure exports from use-session-bootstrap.
 *
 * NOTE: useSessionBootstrap itself was previously untestable (hung vitest due to
 * sessionStorage + async effects + useRouter interactions, tracked in #422).
 * With all external dependencies mocked it is now fully testable — the hang was
 * caused by useSessionRecovery's real saveDraft/router interactions.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const {
  mockLoadSessionQuestions,
  mockReadSessionHandoff,
  mockReadActiveSession,
  mockClearActiveSession,
  mockClearSessionHandoff,
  mockToSessionData,
  mockRouter,
} = vi.hoisted(() => {
  // The router object MUST be stable across renders. useEffect depends on [router, userId],
  // so a new object literal on each render would cause the effect to re-run after every
  // state update, re-setting recovery and blocking clearRecovery / setRecovery(null).
  const router = { replace: vi.fn() }
  return {
    mockLoadSessionQuestions: vi.fn(),
    mockReadSessionHandoff: vi.fn(),
    mockReadActiveSession: vi.fn(),
    mockClearActiveSession: vi.fn(),
    mockClearSessionHandoff: vi.fn(),
    mockToSessionData: vi.fn(),
    mockRouter: router,
  }
})

vi.mock('@/lib/queries/load-session-questions', () => ({
  loadSessionQuestions: (...args: unknown[]) => mockLoadSessionQuestions(...args),
}))

vi.mock('../_utils/quiz-session-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_utils/quiz-session-storage')>()
  return {
    ...actual,
    readSessionHandoff: (...args: unknown[]) => mockReadSessionHandoff(...args),
    readActiveSession: (...args: unknown[]) => mockReadActiveSession(...args),
    clearActiveSession: mockClearActiveSession,
    clearSessionHandoff: mockClearSessionHandoff,
    toSessionData: (...args: unknown[]) => mockToSessionData(...args),
  }
})

vi.mock('./use-session-recovery', () => ({
  useSessionRecovery: () => ({
    loading: false,
    error: null,
    handleSave: vi.fn(),
    handleDiscard: vi.fn(),
  }),
}))

vi.mock('next/navigation', () => ({
  // Return the same stable object every call — useEffect depends on [router, userId],
  // so returning a new literal on each render would re-fire the effect on every state change.
  useRouter: () => mockRouter,
}))

// ---- Subject under test ---------------------------------------------------

import { isValidSessionData } from '../_utils/quiz-session-storage'
import { _resetCachedSession, useSessionBootstrap } from './use-session-bootstrap'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = 'user-abc'
const SESSION_ID = 'sess-00000001'
const Q1 = { id: 'q-00000001', text: 'Question 1', options: [] }
const Q2 = { id: 'q-00000002', text: 'Question 2', options: [] }

const HANDOFF_DATA = { sessionId: SESSION_ID, questionIds: [Q1.id, Q2.id] }
const ACTIVE_SESSION = {
  userId: USER_ID,
  sessionId: SESSION_ID,
  questionIds: [Q1.id, Q2.id],
  answers: {},
  currentIndex: 0,
  savedAt: Date.now(),
}
const SESSION_DATA = { sessionId: SESSION_ID, questionIds: [Q1.id, Q2.id] }
const QUESTIONS_SUCCESS = { success: true as const, questions: [Q1, Q2] }
const QUESTIONS_FAILURE = { success: false as const, error: 'RPC error' }

// ---- Lifecycle -----------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  _resetCachedSession()
  // Default: no session data in storage
  mockReadSessionHandoff.mockReturnValue(null)
  mockReadActiveSession.mockReturnValue(null)
  mockToSessionData.mockReturnValue(SESSION_DATA)
})

// ---- No session data ----------------------------------------------------

describe('useSessionBootstrap — no session data', () => {
  it('redirects to /app/quiz when neither handoff nor active session exists', () => {
    renderHook(() => useSessionBootstrap(USER_ID))
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/quiz')
  })

  it('does not call loadSessionQuestions when there is nothing to load', () => {
    renderHook(() => useSessionBootstrap(USER_ID))
    expect(mockLoadSessionQuestions).not.toHaveBeenCalled()
  })

  it('redirects to /app/quiz when readActiveSession rejects a stale exam entry (pre-deploy, no startedAt)', () => {
    // readActiveSession strips exam entries that lack startedAt/timeLimitSeconds and
    // returns null. The bootstrap must then fall through to router.replace('/app/quiz')
    // rather than showing the recovery prompt for invalid data.
    // This mirrors the storage guard added in c656868 to handle pre-deploy localStorage.
    mockReadActiveSession.mockReturnValue(null) // storage guard already rejected it
    renderHook(() => useSessionBootstrap(USER_ID))
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/quiz')
    expect(mockClearActiveSession).not.toHaveBeenCalled() // caller must not double-clear
  })
})

// ---- Recovery banner path -----------------------------------------------

describe('useSessionBootstrap — active session triggers recovery', () => {
  it('sets recovery when an active session exists in storage and there is no handoff', () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    expect(result.current.recovery).toEqual(ACTIVE_SESSION)
  })

  it('does not redirect when an active session is found', () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)

    renderHook(() => useSessionBootstrap(USER_ID))

    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('does not call loadSessionQuestions on mount when recovery is shown', () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)

    renderHook(() => useSessionBootstrap(USER_ID))

    expect(mockLoadSessionQuestions).not.toHaveBeenCalled()
  })

  it('handoff takes priority over active session', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    // Recovery was NOT set — handoff wins
    expect(result.current.recovery).toBeNull()
  })

  it('shows recovery for an exam-mode active session (no toast, no redirect)', () => {
    // Bug 3a: an in-tab refresh during a Practice Exam must rehydrate from
    // localStorage instead of being bumped to /app/quiz. The categorical
    // exam-reject was removed; pre-ship entries (without startedAt) are now
    // rejected at storage.ts:readActiveSession time, so anything that reaches
    // here is a valid resumable exam.
    const examActive = {
      ...ACTIVE_SESSION,
      mode: 'exam' as const,
      startedAt: '2026-04-27T12:00:00.000Z',
      timeLimitSeconds: 1800,
      passMark: 75,
    }
    mockReadActiveSession.mockReturnValue(examActive)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    expect(result.current.recovery).toEqual(examActive)
    expect(mockRouter.replace).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })
})

// ---- Handoff path -------------------------------------------------------

describe('useSessionBootstrap — handoff success path', () => {
  it('loads questions from the handoff questionIds', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(mockLoadSessionQuestions).toHaveBeenCalledWith(HANDOFF_DATA.questionIds)
  })

  it('sets questions on success', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(result.current.questions).toEqual([Q1, Q2])
  })

  it('clears the session handoff on success', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(mockClearSessionHandoff).toHaveBeenCalledWith(USER_ID)
  })

  it('does NOT call clearActiveSession on handoff success', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('sets error when loadSessionQuestions returns failure', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_FAILURE)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.error).not.toBeNull())

    expect(result.current.error).toBe('RPC error')
  })

  it('sets a generic error when loadSessionQuestions throws', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.error).not.toBeNull())

    expect(result.current.error).toBe('Failed to load questions. Please try again.')
  })

  it('does not set error when questions load successfully', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(result.current.error).toBeNull()
  })
})

// ---- handleRecoveryResume -----------------------------------------------

describe('useSessionBootstrap — handleRecoveryResume', () => {
  it('is a no-op when recovery is null', async () => {
    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    expect(mockLoadSessionQuestions).not.toHaveBeenCalled()
  })

  it('loads questions using the recovery questionIds', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    expect(mockLoadSessionQuestions).toHaveBeenCalledWith(ACTIVE_SESSION.questionIds)
  })

  it('sets questions on successful resume', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(result.current.questions).toEqual([Q1, Q2])
  })

  it('does NOT call clearActiveSession on resume success', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('sets resumeLoading to false after a successful resume', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.resumeLoading).toBe(false))
  })

  it('clears recovery after a successful resume', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    // Wait for recovery to be populated by the mount effect before calling resume
    await waitFor(() => expect(result.current.recovery).not.toBeNull())

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.recovery).toBeNull())
  })

  it('sets resumeError when questions fail to load', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_FAILURE)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.resumeError).not.toBeNull())

    expect(result.current.resumeError).toBe('RPC error')
  })

  it('sets a fallback resumeError when failure has no error string', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue({ success: false as const })

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.resumeError).not.toBeNull())

    expect(result.current.resumeError).toBe('Failed to load questions. Try again.')
  })

  it('sets a generic resumeError when loadSessionQuestions throws', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.resumeError).not.toBeNull())

    expect(result.current.resumeError).toBe('Failed to load questions. Please try again.')
  })

  it('resets resumeLoading to false after a failed resume', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_FAILURE)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.resumeLoading).toBe(false))
  })
})

// ---- Bug-3a lifecycle: exam-mode refresh-recovery ----------------------
// Lifecycle integration test per code-style.md §7:
// entry path → recovery set → user clicks Resume → loadSessionQuestions →
// toSessionData produces session with exam fields → QuizSession can reconstruct timer.

describe('useSessionBootstrap — exam-mode refresh-recovery lifecycle (Bug 3a)', () => {
  const EXAM_ACTIVE: typeof ACTIVE_SESSION & {
    mode: 'exam'
    startedAt: string
    timeLimitSeconds: number
    passMark: number
  } = {
    ...ACTIVE_SESSION,
    mode: 'exam' as const,
    startedAt: '2026-04-27T12:00:00.000Z',
    timeLimitSeconds: 1800,
    passMark: 75,
  }

  const EXAM_SESSION_DATA = {
    ...SESSION_DATA,
    mode: 'exam' as const,
    startedAt: '2026-04-27T12:00:00.000Z',
    timeLimitSeconds: 1800,
    passMark: 75,
  }

  it('sets recovery with exam fields when readActiveSession returns an exam-mode entry', () => {
    mockReadActiveSession.mockReturnValue(EXAM_ACTIVE)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    expect(result.current.recovery).toEqual(EXAM_ACTIVE)
    expect(result.current.recovery?.startedAt).toBe('2026-04-27T12:00:00.000Z')
    expect(result.current.recovery?.timeLimitSeconds).toBe(1800)
    expect(result.current.recovery?.passMark).toBe(75)
  })

  it('does not redirect and does not clear localStorage when exam recovery is pending', () => {
    mockReadActiveSession.mockReturnValue(EXAM_ACTIVE)

    renderHook(() => useSessionBootstrap(USER_ID))

    expect(mockRouter.replace).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('produces a session with startedAt/timeLimitSeconds/passMark after handleRecoveryResume succeeds', async () => {
    // Full Bug-3a lifecycle: refresh → readActiveSession returns exam entry →
    // recovery shown → user clicks Resume → loadSessionQuestions → toSessionData
    // propagates exam fields → session state carries them for the loader to forward.
    mockReadActiveSession.mockReturnValue(EXAM_ACTIVE)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockToSessionData.mockReturnValue(EXAM_SESSION_DATA)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.recovery).not.toBeNull())

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.session).not.toBeNull())

    expect(result.current.session?.mode).toBe('exam')
    expect(result.current.session?.startedAt).toBe('2026-04-27T12:00:00.000Z')
    expect(result.current.session?.timeLimitSeconds).toBe(1800)
    expect(result.current.session?.passMark).toBe(75)
    // Recovery must be cleared after successful resume
    expect(result.current.recovery).toBeNull()
    // toSessionData must have been called with the exam ActiveSession
    expect(mockToSessionData).toHaveBeenCalledWith(EXAM_ACTIVE)
  })

  it('loads questions using the exam session questionIds on resume', async () => {
    mockReadActiveSession.mockReturnValue(EXAM_ACTIVE)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockToSessionData.mockReturnValue(EXAM_SESSION_DATA)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.recovery).not.toBeNull())

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(mockLoadSessionQuestions).toHaveBeenCalledWith(EXAM_ACTIVE.questionIds)
  })
})

// ---- clearRecovery / clearResumeError -----------------------------------

describe('useSessionBootstrap — clearRecovery', () => {
  it('sets recovery to null', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    expect(result.current.recovery).toEqual(ACTIVE_SESSION)

    act(() => {
      result.current.clearRecovery()
    })

    expect(result.current.recovery).toBeNull()
  })
})

describe('useSessionBootstrap — clearResumeError', () => {
  it('sets resumeError to null', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_FAILURE)

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await act(async () => {
      result.current.handleRecoveryResume()
    })

    await waitFor(() => expect(result.current.resumeError).not.toBeNull())

    act(() => {
      result.current.clearResumeError()
    })

    expect(result.current.resumeError).toBeNull()
  })
})

// ---- isValidSessionData --------------------------------------------------

describe('isValidSessionData', () => {
  const VALID_USER = 'user-abc'

  it('returns true for a minimal valid payload', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'] }
    expect(isValidSessionData(data, VALID_USER)).toBe(true)
  })

  it('returns true for a full payload without userId field', () => {
    const data = {
      sessionId: 'sess-1',
      questionIds: ['q1', 'q2'],
      draftAnswers: {},
      draftCurrentIndex: 0,
      draftId: 'draft-1',
      subjectName: 'Met',
      subjectCode: 'MET',
    }
    expect(isValidSessionData(data, VALID_USER)).toBe(true)
  })

  it('returns false for null', () => {
    expect(isValidSessionData(null, VALID_USER)).toBe(false)
  })

  it('returns false for a primitive string', () => {
    expect(isValidSessionData('not-an-object', VALID_USER)).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isValidSessionData(42, VALID_USER)).toBe(false)
  })

  it('returns false when sessionId is missing', () => {
    const data = { questionIds: ['q1'] }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when sessionId is an empty string', () => {
    const data = { sessionId: '', questionIds: ['q1'] }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when sessionId is a number', () => {
    const data = { sessionId: 123, questionIds: ['q1'] }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when questionIds is missing', () => {
    const data = { sessionId: 'sess-1' }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when questionIds is not an array', () => {
    const data = { sessionId: 'sess-1', questionIds: 'q1' }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when questionIds is an empty array', () => {
    const data = { sessionId: 'sess-1', questionIds: [] }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when userId is present but does not match expectedUserId', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], userId: 'other-user' }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns true when userId is present and matches expectedUserId', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], userId: VALID_USER }
    expect(isValidSessionData(data, VALID_USER)).toBe(true)
  })

  it('returns true when userId field is absent (no cross-user check applied)', () => {
    // The guard only fires when userId is IN the payload — omitting it is allowed.
    const data = { sessionId: 'sess-1', questionIds: ['q1'] }
    expect(isValidSessionData(data, 'any-user-id')).toBe(true)
  })

  it('narrows type — result is SessionData when true', () => {
    const data: unknown = { sessionId: 'sess-1', questionIds: ['q1'] }
    if (isValidSessionData(data, VALID_USER)) {
      // TypeScript type narrowing: accessing .sessionId should compile
      expect(data.sessionId).toBe('sess-1')
    }
  })

  it('returns false when draftCurrentIndex is a string', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftCurrentIndex: '0' }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when draftCurrentIndex is negative', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftCurrentIndex: -1 }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when draftCurrentIndex is a float', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftCurrentIndex: 1.5 }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when draftCurrentIndex exceeds questionIds length', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftCurrentIndex: 99 }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when draftCurrentIndex equals questionIds length (off-by-one)', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftCurrentIndex: 1 }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns true when draftCurrentIndex is the last valid index', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1', 'q2'], draftCurrentIndex: 1 }
    expect(isValidSessionData(data, VALID_USER)).toBe(true)
  })

  it('returns false when draftAnswers is an array', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], draftAnswers: ['not-object'] }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when subjectName is a number', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], subjectName: 123 }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })

  it('returns false when subjectCode is a number', () => {
    const data = { sessionId: 'sess-1', questionIds: ['q1'], subjectCode: 123 }
    expect(isValidSessionData(data, VALID_USER)).toBe(false)
  })
})
