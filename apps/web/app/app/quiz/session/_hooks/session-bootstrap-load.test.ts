import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoadSessionQuestions, mockGetFlaggedIds, mockReadSessionHandoff } = vi.hoisted(() => ({
  mockLoadSessionQuestions: vi.fn(),
  mockGetFlaggedIds: vi.fn(),
  mockReadSessionHandoff: vi.fn(),
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
  }
})

import { type ActiveSession, toSessionData } from '../_utils/quiz-session-storage'
import {
  _resetCachedSession,
  buildRecoveryResume,
  dropCachedSession,
  loadSessionData,
  readBootstrapSession,
} from './session-bootstrap-load'

const USER_ID = 'user-abc'
const OTHER_USER_ID = 'user-other'
const Q1 = { id: 'q-00000001', text: 'Question 1', options: [] }
const Q2 = { id: 'q-00000002', text: 'Question 2', options: [] }
const QUESTION_IDS = [Q1.id, Q2.id]
const SESSION_DATA = { sessionId: 'sess-00000001', questionIds: QUESTION_IDS }
const QUESTIONS_SUCCESS = { success: true as const, questions: [Q1, Q2] }
const QUESTIONS_FAILURE = { success: false as const, error: 'RPC error' }

beforeEach(() => {
  vi.resetAllMocks()
  _resetCachedSession()
  mockReadSessionHandoff.mockReturnValue(null)
})

// ---- loadSessionData -------------------------------------------------------

describe('loadSessionData', () => {
  it('returns the questions and the flagged ids when both fetches succeed', async () => {
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [Q1.id] })

    const result = await loadSessionData(QUESTION_IDS)

    expect(result).toEqual({ success: true, questions: [Q1, Q2], flaggedIds: [Q1.id] })
  })

  it('requests the questions and the flags for the same question ids', async () => {
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })

    await loadSessionData(QUESTION_IDS)

    expect(mockLoadSessionQuestions).toHaveBeenCalledWith(QUESTION_IDS)
    expect(mockGetFlaggedIds).toHaveBeenCalledWith({ questionIds: QUESTION_IDS })
  })

  it('loads the session with no flags when the flag fetch rejects', async () => {
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockGetFlaggedIds.mockRejectedValue(new Error('network down'))

    const result = await loadSessionData(QUESTION_IDS)

    // The flag fetch never controls the outcome — questions load, flags degrade to [].
    expect(result).toEqual({ success: true, questions: [Q1, Q2], flaggedIds: [] })
  })

  it('loads the session with no flags when the flag fetch never settles', async () => {
    vi.useFakeTimers()
    try {
      mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
      // A hung flag fetch (pending forever) must not block the bootstrap.
      mockGetFlaggedIds.mockReturnValue(new Promise(() => undefined))

      const resultPromise = loadSessionData(QUESTION_IDS)
      await vi.advanceTimersByTimeAsync(3000)

      expect(await resultPromise).toEqual({ success: true, questions: [Q1, Q2], flaggedIds: [] })
    } finally {
      vi.useRealTimers()
    }
  })

  it('loads the session with no flags when the flag fetch reports failure', async () => {
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockGetFlaggedIds.mockResolvedValue({ success: false, error: 'Failed to fetch flags' })

    const result = await loadSessionData(QUESTION_IDS)

    expect(result).toEqual({ success: true, questions: [Q1, Q2], flaggedIds: [] })
  })

  it('surfaces the questions error when the questions fetch fails', async () => {
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_FAILURE)
    mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [Q1.id] })

    const result = await loadSessionData(QUESTION_IDS)

    expect(result).toEqual({ success: false, error: 'RPC error' })
  })

  it('returns a generic load error when the questions fetch rejects', async () => {
    mockLoadSessionQuestions.mockRejectedValue(new Error('network'))
    mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })

    const result = await loadSessionData(QUESTION_IDS)

    expect(result).toEqual({
      success: false,
      error: 'Failed to load questions. Please try again.',
    })
  })

  it('fails on the questions error even when the flag fetch also rejects', async () => {
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_FAILURE)
    mockGetFlaggedIds.mockRejectedValue(new Error('network down'))

    const result = await loadSessionData(QUESTION_IDS)

    expect(result).toEqual({ success: false, error: 'RPC error' })
  })
})

// ---- readBootstrapSession / dropCachedSession ------------------------------

describe('readBootstrapSession', () => {
  it('returns the handoff when sessionStorage has one', () => {
    mockReadSessionHandoff.mockReturnValue(SESSION_DATA)
    expect(readBootstrapSession(USER_ID)).toEqual(SESSION_DATA)
  })

  it('returns null when neither the handoff nor the cache has data', () => {
    expect(readBootstrapSession(USER_ID)).toBeNull()
  })

  it('serves the previously-read session again after the handoff is gone', () => {
    // First read caches; a remount after clearSessionHandoff still finds the session.
    mockReadSessionHandoff.mockReturnValueOnce(SESSION_DATA)
    expect(readBootstrapSession(USER_ID)).toEqual(SESSION_DATA)

    mockReadSessionHandoff.mockReturnValue(null)
    expect(readBootstrapSession(USER_ID)).toEqual(SESSION_DATA)
  })

  it('does not serve a cached session to a different user', () => {
    mockReadSessionHandoff.mockReturnValueOnce(SESSION_DATA)
    readBootstrapSession(USER_ID)

    mockReadSessionHandoff.mockReturnValue(null)
    expect(readBootstrapSession(OTHER_USER_ID)).toBeNull()
  })
})

// ---- buildRecoveryResume ---------------------------------------------------

describe('buildRecoveryResume', () => {
  const RECOVERY: ActiveSession = {
    userId: USER_ID,
    sessionId: SESSION_DATA.sessionId,
    questionIds: QUESTION_IDS,
    answers: {},
    currentIndex: 0,
    savedAt: Date.now(),
  }

  function buildSetters() {
    return {
      setSession: vi.fn(),
      setQuestions: vi.fn(),
      setFlaggedIds: vi.fn(),
      setRecovery: vi.fn(),
      setResumeLoading: vi.fn(),
      setResumeError: vi.fn(),
    }
  }

  /** Let the handler's internal load promise chain settle (real timers). */
  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('does nothing when there is no session to resume', async () => {
    const set = buildSetters()

    buildRecoveryResume(null, set)()
    await flushAsync()

    expect(mockLoadSessionQuestions).not.toHaveBeenCalled()
    for (const setter of Object.values(set)) {
      expect(setter).not.toHaveBeenCalled()
    }
  })

  it('surfaces the error and keeps the recovery prompt open when the resume load fails', async () => {
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_FAILURE)
    mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })
    const set = buildSetters()

    buildRecoveryResume(RECOVERY, set)()
    await flushAsync()

    expect(set.setResumeError).toHaveBeenCalledWith('RPC error')
    expect(set.setResumeLoading).toHaveBeenLastCalledWith(false)
    // The prompt stays open so the user can retry or discard — recovery is NOT cleared.
    expect(set.setRecovery).not.toHaveBeenCalled()
    expect(set.setSession).not.toHaveBeenCalled()
    expect(set.setQuestions).not.toHaveBeenCalled()
  })

  it('hydrates the session, questions, and flags after a successful resume', async () => {
    mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_SUCCESS)
    mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [Q1.id] })
    const set = buildSetters()

    buildRecoveryResume(RECOVERY, set)()
    await flushAsync()

    expect(set.setSession).toHaveBeenCalledWith(toSessionData(RECOVERY))
    expect(set.setQuestions).toHaveBeenCalledWith([Q1, Q2])
    expect(set.setFlaggedIds).toHaveBeenCalledWith([Q1.id])
    expect(set.setResumeLoading).toHaveBeenLastCalledWith(false)
    expect(set.setRecovery).toHaveBeenCalledWith(null)
    expect(set.setResumeError).not.toHaveBeenCalledWith(expect.any(String))
  })
})

describe('dropCachedSession', () => {
  it('stops serving the cached session for the dropped user', () => {
    mockReadSessionHandoff.mockReturnValueOnce(SESSION_DATA)
    readBootstrapSession(USER_ID)
    mockReadSessionHandoff.mockReturnValue(null)

    dropCachedSession(USER_ID)

    expect(readBootstrapSession(USER_ID)).toBeNull()
  })

  it('keeps the cached session when a different user is dropped', () => {
    mockReadSessionHandoff.mockReturnValueOnce(SESSION_DATA)
    readBootstrapSession(USER_ID)
    mockReadSessionHandoff.mockReturnValue(null)

    dropCachedSession(OTHER_USER_ID)

    expect(readBootstrapSession(USER_ID)).toEqual(SESSION_DATA)
  })
})
