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

// ---- Subject under test ---------------------------------------------------

import { useQuizStart } from './use-quiz-start'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const TOPIC_ID = '00000000-0000-4000-a000-000000000020'
const SUBTOPIC_ID = '00000000-0000-4000-a000-000000000030'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'

const SUBJECTS = [{ id: SUBJECT_ID, code: '010', name: 'Air Law', short: 'ALW', questionCount: 50 }]

const DEFAULT_OPTS = {
  subjectId: SUBJECT_ID,
  topicId: '',
  subtopicId: '',
  subjects: SUBJECTS,
  count: 10,
  maxQuestions: 50,
  filter: 'all' as const,
}

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: [Q1_ID, Q2_ID],
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  // Replace sessionStorage.setItem with our spy
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSessionStorageSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
  })
  mockStartQuizSession.mockResolvedValue(SUCCESS_RESULT)
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
  it('calls startQuizSession with the correct arguments', async () => {
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: SUBJECT_ID,
        topicId: null,
        subtopicId: null,
        count: 10,
        filter: 'all',
      }),
    )
  })

  it('passes topicId and subtopicId when they are non-empty', async () => {
    const { result } = renderHook(() =>
      useQuizStart({ ...DEFAULT_OPTS, topicId: TOPIC_ID, subtopicId: SUBTOPIC_ID }),
    )
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: TOPIC_ID,
        subtopicId: SUBTOPIC_ID,
      }),
    )
  })

  it('caps count at maxQuestions to prevent over-requesting', async () => {
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
      'quiz-session',
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
})
