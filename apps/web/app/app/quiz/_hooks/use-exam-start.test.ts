import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockStartExamSession, mockGetActivePracticeSession } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartExamSession: vi.fn(),
  mockGetActivePracticeSession: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions/start-exam', () => ({
  startExamSession: (...args: unknown[]) => mockStartExamSession(...args),
}))

vi.mock('../actions/get-active-practice-session', () => ({
  getActivePracticeSession: (...args: unknown[]) => mockGetActivePracticeSession(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { useExamStart } from './use-exam-start'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'

const EXAM_SUBJECTS = [
  {
    id: SUBJECT_ID,
    code: '010',
    name: 'Air Law',
    short: 'ALW',
    totalQuestions: 50,
    timeLimitSeconds: 3600,
    passMark: 75,
  },
]

const DEFAULT_OPTS = {
  subjectId: SUBJECT_ID,
  examSubjects: EXAM_SUBJECTS,
}

const STARTED_AT = '2026-04-27T12:00:00.000Z'

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: [Q1_ID, Q2_ID],
  totalQuestions: 2,
  timeLimitSeconds: 3600,
  passMark: 75,
  startedAt: STARTED_AT,
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockStartExamSession.mockResolvedValue(SUCCESS_RESULT)
})

// ---- Initial state -------------------------------------------------------

describe('useExamStart — initial state', () => {
  it('starts with loading false and no error', () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('exposes handleStart as a function', () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    expect(typeof result.current.handleStart).toBe('function')
  })
})

// ---- handleStart — guards ------------------------------------------------

describe('useExamStart — handleStart guards', () => {
  it('does nothing when subjectId is empty', async () => {
    const { result } = renderHook(() => useExamStart({ ...DEFAULT_OPTS, subjectId: '' }))
    await act(async () => result.current.handleStart())
    expect(mockStartExamSession).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('blocks a second call while the first is still in flight', async () => {
    let resolveFirst!: (v: typeof SUCCESS_RESULT) => void
    mockStartExamSession.mockReturnValueOnce(
      new Promise<typeof SUCCESS_RESULT>((res) => {
        resolveFirst = res
      }),
    )

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))

    // Fire the first call — loading becomes true, promise is pending
    act(() => {
      void result.current.handleStart()
    })

    // Fire the second call while the first is still in flight
    await act(async () => result.current.handleStart())

    // The second call must have been swallowed — action called exactly once
    expect(mockStartExamSession).toHaveBeenCalledTimes(1)

    // Resolve the first call so the hook can clean up its state
    await act(async () => {
      resolveFirst(SUCCESS_RESULT)
    })
  })

  it('does not start a second exam when clicked twice in the same tick', async () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))

    // Two synchronous invocations with no flush between them — the async `loading`
    // state has not committed yet when the second call fires.
    await act(async () => {
      void result.current.handleStart()
      void result.current.handleStart()
    })

    expect(mockStartExamSession).toHaveBeenCalledTimes(1)
  })
})

// ---- handleStart — happy path -------------------------------------------

describe('useExamStart — handleStart happy path', () => {
  it('calls startExamSession with the correct subjectId', async () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockStartExamSession).toHaveBeenCalledWith({ subjectId: SUBJECT_ID })
  })

  it('navigates to /app/quiz/session/<id>, never calls sessionStorage.setItem, never reads localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockRouterPush).toHaveBeenCalledWith(`/app/quiz/session/${SESSION_ID}`)
    expect(setItem).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
  })
})

describe('useExamStart — handleStart failure paths', () => {
  it('sets error state when startExamSession returns a failure result', async () => {
    mockStartExamSession.mockResolvedValue({
      success: false as const,
      error: 'Practice Exam is not configured for this subject.',
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toBe('Practice Exam is not configured for this subject.')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('clears loading state after a failed startExamSession call', async () => {
    mockStartExamSession.mockResolvedValue({
      success: false as const,
      error: 'Not authenticated',
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.loading).toBe(false)
  })

  it('sets a generic error message when startExamSession throws', async () => {
    mockStartExamSession.mockRejectedValue(new Error('network timeout'))

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toBe('Something went wrong. Please try again.')
    expect(result.current.loading).toBe(false)
  })

  it('does not navigate when startExamSession throws', async () => {
    mockStartExamSession.mockRejectedValue(new Error('network timeout'))

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('offers to save the blocking practice quiz when the start is blocked', async () => {
    mockStartExamSession.mockResolvedValue({
      success: false as const,
      error: 'Another session is active',
      blocked: true,
    })
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'blocker-1', subjectName: 'Meteorology' },
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.blocked.offer).toEqual({
      sessionId: 'blocker-1',
      subjectName: 'Meteorology',
    })
  })
})
