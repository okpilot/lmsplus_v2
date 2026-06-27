import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockStartStudy, mockSessionStorageSetItem } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartStudy: vi.fn(),
  mockSessionStorageSetItem: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions/study', () => ({
  startStudy: (...args: unknown[]) => mockStartStudy(...args),
}))

vi.mock('../session/_utils/quiz-session-storage', () => ({
  sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
}))

// ---- Subject under test ---------------------------------------------------

import type { StudyQuestion } from '@/lib/queries/study-queries'
import { useStudyStart } from './use-study-start'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const SUBJECTS = [
  { id: SUBJECT_ID, code: '050', name: 'Meteorology', short: 'MET', questionCount: 30 },
]

function makeTopicTree(topicIds: string[] = [], subtopicIds: string[] = []) {
  return {
    getSelectedTopicIds: vi.fn(() => topicIds),
    getSelectedSubtopicIds: vi.fn(() => subtopicIds),
  }
}

const DEFAULT_OPTS = {
  userId: 'test-user-id',
  subjectId: SUBJECT_ID,
  subjects: SUBJECTS,
  count: 10,
  maxQuestions: 100,
  topicTree: makeTopicTree(),
}

function makeQuestion(id = 'q-1'): StudyQuestion {
  return {
    id,
    questionText: 'What is the MATZ radius?',
    questionImageUrl: null,
    options: [{ id: 'a', text: '5 nm' }],
    correctOptionId: 'a',
    subjectCode: null,
    topicName: null,
    subtopicName: null,
    explanationText: null,
    explanationImageUrl: null,
    questionNumber: null,
    difficulty: null,
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSessionStorageSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
  })
  mockStartStudy.mockResolvedValue({ success: true, questions: [makeQuestion()] })
})

// ---- Initial state -------------------------------------------------------

describe('useStudyStart — initial state', () => {
  it('starts with no loading and no error', () => {
    const { result } = renderHook(() => useStudyStart(DEFAULT_OPTS))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

// ---- handleStart — guards ------------------------------------------------

describe('useStudyStart — handleStart guards', () => {
  it('does not call the action when subjectId is empty', async () => {
    const { result } = renderHook(() => useStudyStart({ ...DEFAULT_OPTS, subjectId: '' }))
    await act(async () => result.current.handleStart())
    expect(mockStartStudy).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('ignores a second call while a start is already in progress', async () => {
    let resolveFirst!: (v: { success: true; questions: StudyQuestion[] }) => void
    mockStartStudy.mockReturnValueOnce(
      new Promise<{ success: true; questions: StudyQuestion[] }>((res) => {
        resolveFirst = res
      }),
    )

    const { result } = renderHook(() => useStudyStart(DEFAULT_OPTS))

    act(() => {
      void result.current.handleStart()
    })
    await act(async () => result.current.handleStart())

    expect(mockStartStudy).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirst({ success: true, questions: [makeQuestion()] })
    })
  })
})

// ---- handleStart — payload building --------------------------------------

describe('useStudyStart — handleStart payload', () => {
  it('clamps count to maxQuestions when count exceeds the available pool', async () => {
    const { result } = renderHook(() =>
      useStudyStart({ ...DEFAULT_OPTS, count: 50, maxQuestions: 20 }),
    )
    await act(async () => result.current.handleStart())
    expect(mockStartStudy).toHaveBeenCalledWith(expect.objectContaining({ count: 20 }))
  })

  it('uses 1 as the minimum count when maxQuestions is 0', async () => {
    const { result } = renderHook(() =>
      useStudyStart({ ...DEFAULT_OPTS, count: 5, maxQuestions: 0 }),
    )
    await act(async () => result.current.handleStart())
    expect(mockStartStudy).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }))
  })

  it('passes undefined for topicIds and subtopicIds when no topics are selected', async () => {
    const { result } = renderHook(() =>
      useStudyStart({ ...DEFAULT_OPTS, topicTree: makeTopicTree([], []) }),
    )
    await act(async () => result.current.handleStart())
    expect(mockStartStudy).toHaveBeenCalledWith(
      expect.objectContaining({ topicIds: undefined, subtopicIds: undefined }),
    )
  })

  it('passes selected topic and subtopic arrays when topics are chosen', async () => {
    const { result } = renderHook(() =>
      useStudyStart({ ...DEFAULT_OPTS, topicTree: makeTopicTree(['t1', 't2'], ['st1']) }),
    )
    await act(async () => result.current.handleStart())
    expect(mockStartStudy).toHaveBeenCalledWith(
      expect.objectContaining({ topicIds: ['t1', 't2'], subtopicIds: ['st1'] }),
    )
  })

  it('passes topicIds array but undefined for subtopicIds when only topics are selected', async () => {
    const { result } = renderHook(() =>
      useStudyStart({ ...DEFAULT_OPTS, topicTree: makeTopicTree(['t1', 't2'], []) }),
    )
    await act(async () => result.current.handleStart())
    expect(mockStartStudy).toHaveBeenCalledWith(
      expect.objectContaining({ topicIds: ['t1', 't2'], subtopicIds: undefined }),
    )
  })
})

// ---- handleStart — happy path (navigate) ---------------------------------

describe('useStudyStart — handleStart navigates to the session runner', () => {
  it('writes the pre-marked discovery handoff to sessionStorage on success', async () => {
    mockStartStudy.mockResolvedValue({ success: true, questions: [makeQuestion('q-1')] })
    const { result } = renderHook(() => useStudyStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(mockSessionStorageSetItem).toHaveBeenCalledTimes(1)
    const [key, json] = mockSessionStorageSetItem.mock.calls[0] as [string, string]
    expect(key).toBe('quiz-session:test-user-id')
    const payload = JSON.parse(json) as Record<string, unknown>
    expect(payload.mode).toBe('discovery')
    expect(payload.questionIds).toEqual(['q-1'])
    expect(payload.userId).toBe('test-user-id')
  })

  it('includes the resolved subjectName and subjectCode in the handoff', async () => {
    const { result } = renderHook(() => useStudyStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    const json = mockSessionStorageSetItem.mock.calls[0]?.[1] as string
    const payload = JSON.parse(json) as Record<string, unknown>
    expect(payload.subjectName).toBe('Meteorology')
    expect(payload.subjectCode).toBe('MET')
  })

  it('navigates to /app/quiz/session after writing the handoff', async () => {
    const { result } = renderHook(() => useStudyStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
  })
})

// ---- handleStart — empty result ------------------------------------------

describe('useStudyStart — empty result', () => {
  it('shows a no-questions message and does not navigate when the pool is empty', async () => {
    mockStartStudy.mockResolvedValue({ success: true, questions: [] })
    const { result } = renderHook(() => useStudyStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toBe('No questions match these filters.')
    expect(mockSessionStorageSetItem).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })
})

// ---- handleStart — failure path ------------------------------------------

describe('useStudyStart — handleStart failure path', () => {
  it('surfaces the active-exam message inline and does not navigate', async () => {
    mockStartStudy.mockResolvedValue({
      success: false,
      error: 'Finish or exit your active exam first.',
    })
    const { result } = renderHook(() => useStudyStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toBe('Finish or exit your active exam first.')
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockSessionStorageSetItem).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('sets a fallback error and does not navigate when the action throws', async () => {
    mockStartStudy.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useStudyStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toBe('Something went wrong. Please try again.')
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('shows a generic message and does not navigate when sessionStorage throws', async () => {
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const { result } = renderHook(() => useStudyStart(DEFAULT_OPTS))
    await act(async () => result.current.handleStart())

    expect(result.current.error).toMatch(/unable to start/i)
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })
})
