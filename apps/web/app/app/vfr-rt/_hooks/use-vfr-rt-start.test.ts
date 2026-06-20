import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockStartQuizSession } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartQuizSession: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('@/app/app/quiz/actions/start', () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
}))

const { mockReadActiveSession, mockClearActiveSession } = vi.hoisted(() => ({
  mockReadActiveSession: vi.fn(),
  mockClearActiveSession: vi.fn(),
}))

vi.mock('@/app/app/quiz/session/_utils/quiz-session-storage', () => ({
  readActiveSession: () => mockReadActiveSession(),
  clearActiveSession: mockClearActiveSession,
  sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
}))

// ---- Subject under test ---------------------------------------------------

import { useVfrRtStart } from './use-vfr-rt-start'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = 'user-rt-1'
const SUBJECT_ID = 'subj-rt'
const TOPIC_IDS = ['p1', 'p2', 'p3']
const SESSION_ID = 'sess-rt-abc'
const Q_IDS = ['q1', 'q2', 'q3']

const DEFAULT_OPTS = {
  userId: USER_ID,
  subjectId: SUBJECT_ID,
  topicIds: TOPIC_IDS,
  count: 10,
  maxQuestions: 27,
}

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: Q_IDS,
}

const EXISTING_SESSION = {
  sessionId: 'old-sess',
  questionIds: ['q9'],
  answers: {},
  currentIndex: 0,
  subjectName: 'Air Law',
  savedAt: Date.now(),
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  mockStartQuizSession.mockResolvedValue(SUCCESS_RESULT)
  mockReadActiveSession.mockReturnValue(null)
})

// ---- Guard: no parts selected --------------------------------------------

describe('useVfrRtStart — empty parts guard', () => {
  it('sets an error and does not call startQuizSession when no topic ids are provided', async () => {
    const { result } = renderHook(() => useVfrRtStart({ ...DEFAULT_OPTS, topicIds: [] }))
    await act(async () => result.current.handleStart())
    expect(mockStartQuizSession).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/select at least one part/i)
  })

  it('keeps loading false when topicIds is empty', async () => {
    const { result } = renderHook(() => useVfrRtStart({ ...DEFAULT_OPTS, topicIds: [] }))
    await act(async () => result.current.handleStart())
    expect(result.current.loading).toBe(false)
  })
})

// ---- Happy path ----------------------------------------------------------

describe('useVfrRtStart — successful start', () => {
  it('writes the session handoff to the standard quiz-session key and navigates to /app/quiz/session', async () => {
    const { result } = renderHook(() => useVfrRtStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    const stored = sessionStorage.getItem(`quiz-session:${USER_ID}`)
    expect(stored).not.toBeNull()
    const payload = JSON.parse(stored as string)
    expect(payload).toMatchObject({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: Q_IDS,
      subjectName: 'VFR RT',
      subjectCode: 'RT',
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('clamps count to maxQuestions', async () => {
    const { result } = renderHook(() =>
      useVfrRtStart({ ...DEFAULT_OPTS, count: 100, maxQuestions: 27 }),
    )
    await act(async () => result.current.handleStart())
    expect(mockStartQuizSession).toHaveBeenCalledWith(expect.objectContaining({ count: 27 }))
  })

  it('uses 1 as minimum count when maxQuestions is 0', async () => {
    const { result } = renderHook(() =>
      useVfrRtStart({ ...DEFAULT_OPTS, count: 10, maxQuestions: 0 }),
    )
    await act(async () => result.current.handleStart())
    expect(mockStartQuizSession).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }))
  })
})

// ---- Failure path --------------------------------------------------------

describe('useVfrRtStart — failure path', () => {
  it('sets error state and resets loading when startQuizSession returns success:false', async () => {
    mockStartQuizSession.mockResolvedValue({
      success: false as const,
      error: 'No questions available',
    })
    const { result } = renderHook(() => useVfrRtStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(result.current.error).toBe('No questions available')
    expect(result.current.loading).toBe(false)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('sets a generic error and resets loading when startQuizSession throws', async () => {
    mockStartQuizSession.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useVfrRtStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(result.current.error).toBe('Something went wrong. Please try again.')
    expect(result.current.loading).toBe(false)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('sets an error and does not navigate when sessionStorage throws after a successful start', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const { result } = renderHook(() => useVfrRtStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(result.current.error).toMatch(/unable to start/i)
    expect(mockRouterPush).not.toHaveBeenCalled()
    // resetAllMocks resets impl but doesn't detach the spy — restore so it can't
    // leak into later tests in this file (matches the confirm-spy restores below).
    setItemSpy.mockRestore()
  })
})

// ---- Existing-session guard ----------------------------------------------

describe('useVfrRtStart — existing-session handling', () => {
  it('prompts the user before starting when another session is active', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { result } = renderHook(() => useVfrRtStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Air Law'))
    confirmSpy.mockRestore()
  })

  it('aborts the start and does not call startQuizSession when the user cancels', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() => useVfrRtStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(mockStartQuizSession).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('clears the existing session after a successful start when the user confirms', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { result } = renderHook(() => useVfrRtStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })

  it('does not prompt and does not clear anything when no existing session is present', async () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    const { result } = renderHook(() => useVfrRtStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
