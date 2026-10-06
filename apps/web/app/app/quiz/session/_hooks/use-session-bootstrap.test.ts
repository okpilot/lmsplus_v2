/**
 * useSessionBootstrap serves only Discovery: a handoff with mode 'discovery' loads, anything else
 * (no handoff, or a non-discovery handoff) is cleared and sent back to /app/quiz.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockLoadSessionQuestions,
  mockGetFlaggedIds,
  mockReadSessionHandoff,
  mockClearSessionHandoff,
  mockRouter,
} = vi.hoisted(() => ({
  mockLoadSessionQuestions: vi.fn(),
  mockGetFlaggedIds: vi.fn(),
  mockReadSessionHandoff: vi.fn(),
  mockClearSessionHandoff: vi.fn(),
  // Stable object: the bootstrap effect depends on [router, userId].
  mockRouter: { replace: vi.fn() },
}))

vi.mock('@/lib/queries/load-session-questions', () => ({
  loadSessionQuestions: (...args: unknown[]) => mockLoadSessionQuestions(...args),
}))

vi.mock('../../actions/flag', () => ({
  getFlaggedIds: (...args: unknown[]) => mockGetFlaggedIds(...args),
}))

vi.mock('../_utils/quiz-session-handoff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_utils/quiz-session-handoff')>()
  return {
    ...actual,
    readSessionHandoff: (...args: unknown[]) => mockReadSessionHandoff(...args),
    clearSessionHandoff: mockClearSessionHandoff,
  }
})

vi.mock('next/navigation', () => ({ useRouter: () => mockRouter }))

import { isValidSessionData } from '../_utils/quiz-session-handoff'
import { _resetCachedSession } from './session-bootstrap-load'
import { useSessionBootstrap } from './use-session-bootstrap'

const USER_ID = 'user-abc'
const SESSION_ID = 'sess-00000001'
const Q1 = { id: 'q-00000001', text: 'Question 1', options: [] }
const Q2 = { id: 'q-00000002', text: 'Question 2', options: [] }

const HANDOFF_DATA = {
  sessionId: SESSION_ID,
  questionIds: [Q1.id, Q2.id],
  mode: 'discovery' as const,
}
const QUESTIONS_SUCCESS = { success: true as const, questions: [Q1, Q2] }
const QUESTIONS_FAILURE = { success: false as const, error: 'RPC error' }

beforeEach(() => {
  vi.resetAllMocks()
  _resetCachedSession()
  mockReadSessionHandoff.mockReturnValue(null)
  mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })
})

describe('useSessionBootstrap — handoff that cannot be served', () => {
  it('replaces with /app/quiz when there is no handoff', () => {
    renderHook(() => useSessionBootstrap(USER_ID))
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/quiz')
    expect(mockLoadSessionQuestions).not.toHaveBeenCalled()
  })

  it('clears a non-discovery handoff and replaces with /app/quiz', () => {
    mockReadSessionHandoff.mockReturnValue({ ...HANDOFF_DATA, mode: 'study' })
    renderHook(() => useSessionBootstrap(USER_ID))
    expect(mockClearSessionHandoff).toHaveBeenCalledWith(USER_ID)
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/quiz')
    expect(mockLoadSessionQuestions).not.toHaveBeenCalled()
  })

  it('clears a handoff with no mode and replaces with /app/quiz', () => {
    mockReadSessionHandoff.mockReturnValue({ sessionId: SESSION_ID, questionIds: [Q1.id] })
    renderHook(() => useSessionBootstrap(USER_ID))
    expect(mockClearSessionHandoff).toHaveBeenCalledWith(USER_ID)
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/quiz')
  })
})

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

  it('surfaces a load error when applying the loaded session throws', async () => {
    // loadSessionData never rejects, so the only way into the .catch net is a throw
    // inside the .then callback. Without the net the user is stranded on the skeleton
    // forever with error still null — no spinner resolution, no message.
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })
    mockClearSessionHandoff.mockImplementationOnce(() => {
      throw new Error('boom')
    })

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() =>
      expect(result.current.error).toBe('Failed to load questions. Please try again.'),
    )
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

// ---- Flagged ids (parallel with the questions load) -----------------------

describe('useSessionBootstrap — flagged ids', () => {
  it('exposes an empty flag list before any load completes', () => {
    const { result } = renderHook(() => useSessionBootstrap(USER_ID))
    expect(result.current.flaggedIds).toEqual([])
  })

  it('exposes the flagged ids once the handoff questions load', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [Q1.id] })

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(result.current.flaggedIds).toEqual([Q1.id])
    expect(mockGetFlaggedIds).toHaveBeenCalledWith({ questionIds: HANDOFF_DATA.questionIds })
  })

  it('still loads the session with no flags when the flag fetch rejects', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockGetFlaggedIds.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    // A flag failure is cosmetic — it must never surface as a session error.
    expect(result.current.error).toBeNull()
    expect(result.current.flaggedIds).toEqual([])
    // Prove the [] came from the exercised failure path, not the initial state (§7).
    expect(mockGetFlaggedIds).toHaveBeenCalledWith({ questionIds: HANDOFF_DATA.questionIds })
  })

  it('still loads the session with no flags when the flag fetch reports failure', async () => {
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockGetFlaggedIds.mockResolvedValue({ success: false, error: 'Failed to fetch flags' })

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    await waitFor(() => expect(result.current.questions).not.toBeNull())

    expect(result.current.error).toBeNull()
    expect(result.current.flaggedIds).toEqual([])
    // Prove the [] came from the exercised failure path, not the initial state (§7).
    expect(mockGetFlaggedIds).toHaveBeenCalledWith({ questionIds: HANDOFF_DATA.questionIds })
  })

  it('does not show the questions until the flag fetch settles', async () => {
    // QuizSession mounts once, when questions turn non-null — the flag seed cannot
    // be applied late, so questions-ready must gate on BOTH fetches settling.
    mockReadSessionHandoff.mockReturnValue(HANDOFF_DATA)
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    let resolveFlags!: (v: { success: boolean; flaggedIds: string[] }) => void
    mockGetFlaggedIds.mockReturnValue(
      new Promise((res) => {
        resolveFlags = res
      }),
    )

    const { result } = renderHook(() => useSessionBootstrap(USER_ID))

    // Flush the resolved questions fetch — the flag fetch is still pending.
    await act(async () => {})
    expect(result.current.questions).toBeNull()

    await act(async () => {
      resolveFlags({ success: true, flaggedIds: [Q2.id] })
    })

    await waitFor(() => expect(result.current.questions).not.toBeNull())
    expect(result.current.flaggedIds).toEqual([Q2.id])
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
