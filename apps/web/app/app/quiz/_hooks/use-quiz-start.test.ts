import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockStartQuizSession, mockGetActivePracticeSession } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartQuizSession: vi.fn(),
  mockGetActivePracticeSession: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions/start', () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
}))

vi.mock('../actions/get-active-practice-session', () => ({
  getActivePracticeSession: (...args: unknown[]) => mockGetActivePracticeSession(...args),
}))

// ---- Subject under test ---------------------------------------------------

import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
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
  subjectId: SUBJECT_ID,
  subjects: SUBJECTS,
  count: 10,
  maxQuestions: 50,
  filters: ['all'] as QuestionFilterValue[],
  calcMode: 'all' as CalcMode,
  imageMode: 'all' as ImageMode,
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
  mockStartQuizSession.mockResolvedValue(SUCCESS_RESULT)
  mockTopicTree.getSelectedTopicIds.mockReturnValue(['topic-1'])
  mockTopicTree.getSelectedSubtopicIds.mockReturnValue(['sub-1'])
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

  it('blocks concurrent double-click before first response settles', async () => {
    // Make startQuizSession hang so loading stays true across the second call
    let resolveFirst!: (v: typeof SUCCESS_RESULT) => void
    mockStartQuizSession.mockReturnValueOnce(
      new Promise<typeof SUCCESS_RESULT>((res) => {
        resolveFirst = res
      }),
    )

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))

    // Fire the first call — loading becomes true, promise is pending
    act(() => {
      void result.current.handleStart()
    })

    // Fire the second call while the first is still in flight
    await act(async () => result.current.handleStart())

    // The second call must have been swallowed — action called exactly once
    expect(mockStartQuizSession).toHaveBeenCalledTimes(1)

    // Resolve the first call so the hook can clean up its state
    await act(async () => {
      resolveFirst(SUCCESS_RESULT)
    })
  })

  it('does not start a second session when clicked twice in the same tick', async () => {
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))

    // Two synchronous invocations with no flush between them — the async `loading`
    // state has not committed yet when the second call fires.
    await act(async () => {
      void result.current.handleStart()
      void result.current.handleStart()
    })

    expect(mockStartQuizSession).toHaveBeenCalledTimes(1)
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

  it('forwards calcMode to startQuizSession', async () => {
    const { result } = renderHook(() =>
      useQuizStart({ ...DEFAULT_OPTS, calcMode: 'only' as CalcMode }),
    )
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).toHaveBeenCalledWith(expect.objectContaining({ calcMode: 'only' }))
  })

  it('includes the selected image mode in the start request payload', async () => {
    const { result } = renderHook(() =>
      useQuizStart({ ...DEFAULT_OPTS, imageMode: 'only' as ImageMode }),
    )
    await act(async () => result.current.handleStart())

    expect(mockStartQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({ imageMode: 'only' }),
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

  it('navigates to /app/quiz/session/<id> after a successful start', async () => {
    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(mockRouterPush).toHaveBeenCalledWith(`/app/quiz/session/${SESSION_ID}`)
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

  it('offers to save the blocking practice quiz when the start is blocked', async () => {
    mockStartQuizSession.mockResolvedValue({
      success: false as const,
      error: 'Another session is active',
      blocked: true,
    })
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'blocker-1', subjectName: 'Meteorology' },
    })

    const { result } = renderHook(() => useQuizStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.blocked.offer).toEqual({
      sessionId: 'blocker-1',
      subjectName: 'Meteorology',
    })
    expect(result.current.error).toBe('Another session is active')
  })
})
