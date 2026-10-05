import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import {
  _resetCachedSession,
  dropCachedSession,
  FLAG_FETCH_TIMEOUT_MS,
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
  // A per-test `finally` does NOT run when a test times out (its promise stays pending),
  // so a fake-timer test that regresses into a hang would leak fake timers into every
  // later test in the file. This afterEach still runs on timeout and contains the blast
  // radius to the one failing test. No-op when real timers are already active.
  afterEach(() => {
    vi.useRealTimers()
  })

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
      await vi.advanceTimersByTimeAsync(FLAG_FETCH_TIMEOUT_MS)

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

  it('surfaces the questions error without waiting out a hung flag fetch', async () => {
    vi.useFakeTimers()
    try {
      mockLoadSessionQuestions.mockResolvedValue(QUESTIONS_FAILURE)
      mockGetFlaggedIds.mockReturnValue(new Promise(() => undefined))

      // Deliberately no advanceTimersByTimeAsync: the questions failure must resolve on
      // its own. Awaiting both fetches together would pend here until the flag fetch's
      // FLAG_FETCH_TIMEOUT_MS elapsed, so this test fails by timing out on a regression.
      expect(await loadSessionData(QUESTION_IDS)).toEqual({ success: false, error: 'RPC error' })
    } finally {
      vi.useRealTimers()
    }
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
