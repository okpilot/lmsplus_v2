import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockStartExamSession, mockSessionStorageSetItem } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartExamSession: vi.fn(),
  mockSessionStorageSetItem: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions/start-exam', () => ({
  startExamSession: (...args: unknown[]) => mockStartExamSession(...args),
}))

const { mockReadActiveSession, mockClearActiveSession } = vi.hoisted(() => ({
  mockReadActiveSession: vi.fn(),
  mockClearActiveSession: vi.fn(),
}))

vi.mock('../session/_utils/quiz-session-storage', () => ({
  readActiveSession: (userId: string) => mockReadActiveSession(userId),
  clearActiveSession: mockClearActiveSession,
  sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
}))

// ---- Subject under test ---------------------------------------------------

import { useExamStart } from './use-exam-start'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = 'test-user-id'
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
  userId: USER_ID,
  subjectId: SUBJECT_ID,
  examSubjects: EXAM_SUBJECTS,
}

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: [Q1_ID, Q2_ID],
  timeLimitSeconds: 3600,
  passMark: 75,
}

const EXISTING_SESSION = {
  sessionId: 'old-sess',
  questionIds: ['q9'],
  answers: {},
  currentIndex: 0,
  subjectName: 'Meteorology',
  savedAt: Date.now(),
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSessionStorageSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
  })
  mockStartExamSession.mockResolvedValue(SUCCESS_RESULT)
  // Default: no existing session
  mockReadActiveSession.mockReturnValue(null)
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
})

// ---- handleStart — happy path -------------------------------------------

describe('useExamStart — handleStart happy path', () => {
  it('calls startExamSession with the correct subjectId', async () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockStartExamSession).toHaveBeenCalledWith({ subjectId: SUBJECT_ID })
  })

  it('writes session data to sessionStorage after a successful start', async () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockSessionStorageSetItem).toHaveBeenCalledWith(
      `quiz-session:${USER_ID}`,
      expect.stringContaining(SESSION_ID),
    )
  })

  it('includes mode exam in sessionStorage payload', async () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    const storedJson = mockSessionStorageSetItem.mock.calls[0]?.[1] as string
    const stored = JSON.parse(storedJson) as Record<string, unknown>
    expect(stored.mode).toBe('exam')
  })

  it('includes subjectName and subjectCode in sessionStorage when subject is found', async () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    const storedJson = mockSessionStorageSetItem.mock.calls[0]?.[1] as string
    const stored = JSON.parse(storedJson) as Record<string, unknown>
    expect(stored.subjectName).toBe('Air Law')
    expect(stored.subjectCode).toBe('ALW')
  })

  it('includes timeLimitSeconds and passMark in sessionStorage from RPC result', async () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    const storedJson = mockSessionStorageSetItem.mock.calls[0]?.[1] as string
    const stored = JSON.parse(storedJson) as Record<string, unknown>
    expect(stored.timeLimitSeconds).toBe(3600)
    expect(stored.passMark).toBe(75)
  })

  it('navigates to /app/quiz/session after a successful start', async () => {
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('does not call clearActiveSession when no existing session is present', async () => {
    mockReadActiveSession.mockReturnValue(null)
    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })
})

// ---- handleStart — existing session guard --------------------------------

describe('useExamStart — existing session guard', () => {
  it('prompts the user when an active session exists before starting', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })

  it('includes subject name in the confirmation message when it is set', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    let capturedMsg = ''
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockImplementation((msg) => {
      capturedMsg = msg as string
      return true
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(capturedMsg).toContain('Meteorology')
    confirmSpy.mockRestore()
  })

  it('omits the subject name suffix in confirmation when subjectName is absent', async () => {
    mockReadActiveSession.mockReturnValue({ ...EXISTING_SESSION, subjectName: undefined })
    let capturedMsg = ''
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockImplementation((msg) => {
      capturedMsg = msg as string
      return true
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    // Should not contain a parenthesized suffix like "(Meteorology)"
    expect(capturedMsg).not.toMatch(/\(/)
    confirmSpy.mockRestore()
  })

  it('aborts the start when the user cancels the confirmation', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockStartExamSession).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('proceeds with start and clears the old session when user confirms', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockStartExamSession).toHaveBeenCalledTimes(1)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })

  it('does not show a confirmation when no existing session is present', async () => {
    mockReadActiveSession.mockReturnValue(null)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

// ---- handleStart — failure paths ----------------------------------------

describe('useExamStart — handleStart failure paths', () => {
  it('sets error state when startExamSession returns a failure result', async () => {
    mockStartExamSession.mockResolvedValue({
      success: false as const,
      error: 'Exam mode is not configured for this subject.',
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toBe('Exam mode is not configured for this subject.')
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

  it('sets a specific error message when sessionStorage write fails', async () => {
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toBe('Unable to start exam right now. Please try again.')
    expect(result.current.loading).toBe(false)
  })

  it('does not navigate when sessionStorage write fails', async () => {
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('does not clear the existing session when sessionStorage write fails', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockClearActiveSession).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
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

  it('does not clear the existing session when startExamSession returns a failure', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    mockStartExamSession.mockResolvedValue({
      success: false as const,
      error: 'An exam session is already in progress for this subject.',
    })

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockClearActiveSession).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('does not clear the existing session when startExamSession throws', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    mockStartExamSession.mockRejectedValue(new Error('network timeout'))

    const { result } = renderHook(() => useExamStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockClearActiveSession).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
