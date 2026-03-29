import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockStartQuizSession, mockSessionStorageSetItem } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartQuizSession: vi.fn(),
  mockSessionStorageSetItem: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions/start', () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
}))

const { mockReadActiveSession, mockClearActiveSession } = vi.hoisted(() => ({
  mockReadActiveSession: vi.fn(),
  mockClearActiveSession: vi.fn(),
}))

vi.mock('../session/_utils/quiz-session-storage', () => ({
  readActiveSession: () => mockReadActiveSession(),
  clearActiveSession: mockClearActiveSession,
  sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
}))

// ---- Subject under test ---------------------------------------------------

import type { QuestionFilterValue } from '../types'
import { useQuizStart } from './use-quiz-start'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const TOPIC_ID = '00000000-0000-4000-a000-000000000020'
const SUBTOPIC_ID = '00000000-0000-4000-a000-000000000030'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'

const SUBJECTS = [{ id: SUBJECT_ID, code: '010', name: 'Air Law', short: 'ALW', questionCount: 50 }]

const mockTopicTree = {
  getSelectedTopicIds: vi.fn(() => ['topic-1'] as string[]),
  getSelectedSubtopicIds: vi.fn(() => ['sub-1'] as string[]),
}

const DEFAULT_OPTS = {
  userId: 'test-user-id',
  subjectId: SUBJECT_ID,
  subjects: SUBJECTS,
  count: 10,
  maxQuestions: 50,
  filters: ['all'] as QuestionFilterValue[],
  topicTree: mockTopicTree,
}

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: [Q1_ID, Q2_ID],
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSessionStorageSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
  })
  mockStartQuizSession.mockResolvedValue(SUCCESS_RESULT)
  mockTopicTree.getSelectedTopicIds.mockReturnValue(['topic-1'])
  mockTopicTree.getSelectedSubtopicIds.mockReturnValue(['sub-1'])
  // Default: no existing session
  mockReadActiveSession.mockReturnValue(null)
})

// ---- Initial state -------------------------------------------------------

describe('useQuizStart — initial state', () => {
  it('starts with loading false and no error', () => {
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

// ---- handleStart — guard -------------------------------------------------

describe('useQuizStart — handleStart guard', () => {
  it('does nothing when subjectId is empty', async () => {
    const { result } = renderHook(() => useQuizStart({ ...DEFAULT_OPTS, subjectId: '' }))
    await act(async () => result.current.handleStart())
    expect(mockStartQuizSession).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })
})

// ---- handleStart — happy path --------------------------------------------

describe('useQuizStart — handleStart happy path', () => {
  it('calls startQuizSession with topicIds and subtopicIds from topicTree', async () => {
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: SUBJECT_ID,
        topicIds: ['topic-1'],
        subtopicIds: ['sub-1'],
        count: 10,
        filters: ['all'],
      }),
    )
  })

  it('calls startQuizSession with filters array when non-all filters are set', async () => {
    const { result } = renderHook(() =>
      useQuizStart({ ...DEFAULT_OPTS, filters: ['unseen', 'incorrect'] as QuestionFilterValue[] }),
    )
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['unseen', 'incorrect'] }),
    )
  })

  it('omits topicIds when topicTree returns an empty array', async () => {
    mockTopicTree.getSelectedTopicIds.mockReturnValue([])
    mockTopicTree.getSelectedSubtopicIds.mockReturnValue([])
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    const call = mockStartQuizSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.topicIds).toBeUndefined()
    expect(call.subtopicIds).toBeUndefined()
  })

  it('omits subtopicIds when topicTree returns an empty subtopics array', async () => {
    mockTopicTree.getSelectedTopicIds.mockReturnValue([TOPIC_ID])
    mockTopicTree.getSelectedSubtopicIds.mockReturnValue([])
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    const call = mockStartQuizSession.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.topicIds).toEqual([TOPIC_ID])
    expect(call.subtopicIds).toBeUndefined()
  })

  it('passes topicIds and subtopicIds when topicTree returns non-empty arrays', async () => {
    mockTopicTree.getSelectedTopicIds.mockReturnValue([TOPIC_ID])
    mockTopicTree.getSelectedSubtopicIds.mockReturnValue([SUBTOPIC_ID])
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({
        topicIds: [TOPIC_ID],
        subtopicIds: [SUBTOPIC_ID],
      }),
    )
  })

  it('clamps count to maxQuestions to prevent over-requesting', async () => {
    const { result } = renderHook(() =>
      useQuizStart({ ...DEFAULT_OPTS, count: 100, maxQuestions: 20 }),
    )
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).toHaveBeenCalledWith(expect.objectContaining({ count: 20 }))
  })

  it('uses 1 as the minimum count when maxQuestions is 0', async () => {
    const { result } = renderHook(() =>
      useQuizStart({ ...DEFAULT_OPTS, count: 5, maxQuestions: 0 }),
    )
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }))
  })

  it('writes session data to sessionStorage after a successful start', async () => {
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockSessionStorageSetItem).toHaveBeenCalledWith(
      'quiz-session:test-user-id',
      expect.stringContaining(SESSION_ID),
    )
  })

  it('includes subjectName and subjectCode in sessionStorage when subject is found', async () => {
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    const storedJson = mockSessionStorageSetItem.mock.calls[0]?.[1] as string
    const stored = JSON.parse(storedJson) as Record<string, unknown>
    expect(stored.subjectName).toBe('Air Law')
    expect(stored.subjectCode).toBe('ALW')
  })

  it('navigates to /app/quiz/session after a successful start', async () => {
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
  })
})

// ---- handleStart — existing session guard --------------------------------

describe('useQuizStart — existing session guard', () => {
  const EXISTING_SESSION = {
    sessionId: 'old-sess',
    questionIds: ['q9'],
    answers: {},
    currentIndex: 0,
    subjectName: 'Meteorology',
    savedAt: Date.now(),
  }

  it('prompts the user when an active session exists before starting', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Meteorology'))
    confirmSpy.mockRestore()
  })

  it('includes subject name in the confirmation message when it is set', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    let capturedMsg = ''
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockImplementation((msg) => {
      capturedMsg = msg as string
      return true
    })

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(capturedMsg).toContain('Meteorology')
    confirmSpy.mockRestore()
  })

  it('aborts the start when the user cancels the confirmation', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('clears the existing session and continues start when user confirms', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
    expect(mockStartQuizSession).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })

  it('does not show a confirmation when no existing session is present', async () => {
    mockReadActiveSession.mockReturnValue(null)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

// ---- handleStart — failure path ------------------------------------------

describe('useQuizStart — handleStart failure path', () => {
  it('sets error state when startQuizSession returns a failure result', async () => {
    mockStartQuizSession.mockResolvedValue({
      success: false as const,
      error: 'No questions available for this selection',
    })

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toBe('No questions available for this selection')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('clears loading state after a failed startQuizSession call', async () => {
    mockStartQuizSession.mockResolvedValue({
      success: false as const,
      error: 'Not authenticated',
    })

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.loading).toBe(false)
  })

  it('sets a generic error message when startQuizSession throws', async () => {
    mockStartQuizSession.mockRejectedValue(new Error('network timeout'))

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toBe('Something went wrong. Please try again.')
    expect(result.current.loading).toBe(false)
  })

  it('does not navigate when startQuizSession throws', async () => {
    mockStartQuizSession.mockRejectedValue(new Error('network timeout'))

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('preserves the existing session when startQuizSession returns a failure result', async () => {
    const EXISTING_SESSION = {
      sessionId: 'old-sess',
      questionIds: ['q9'],
      answers: {},
      currentIndex: 0,
      subjectName: 'Meteorology',
      savedAt: Date.now(),
    }
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    mockStartQuizSession.mockResolvedValue({
      success: false as const,
      error: 'No questions available for this selection',
    })

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    // clearActiveSession must NOT have been called — the new quiz failed, so the
    // existing session data should still be recoverable
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('preserves the existing session when startQuizSession throws', async () => {
    const EXISTING_SESSION = {
      sessionId: 'old-sess',
      questionIds: ['q9'],
      answers: {},
      currentIndex: 0,
      subjectName: 'Meteorology',
      savedAt: Date.now(),
    }
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    mockStartQuizSession.mockRejectedValue(new Error('network timeout'))

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockClearActiveSession).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('preserves the existing session when sessionStorage throws after a successful start', async () => {
    const EXISTING_SESSION = {
      sessionId: 'old-sess',
      questionIds: ['q9'],
      answers: {},
      currentIndex: 0,
      subjectName: 'Meteorology',
      savedAt: Date.now(),
    }
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    mockStartQuizSession.mockResolvedValue(SUCCESS_RESULT)
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockClearActiveSession).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/unable to start/i)
    confirmSpy.mockRestore()
  })
})
