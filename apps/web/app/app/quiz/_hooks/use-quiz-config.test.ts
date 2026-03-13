import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const {
  mockRouterPush,
  mockStartQuizSession,
  mockFetchTopics,
  mockFetchSubtopics,
  mockGetFilteredCount,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartQuizSession: vi.fn(),
  mockFetchTopics: vi.fn(),
  mockFetchSubtopics: vi.fn(),
  mockGetFilteredCount: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions/start', () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
}))

vi.mock('../actions/lookup', () => ({
  fetchTopicsForSubject: (...args: unknown[]) => mockFetchTopics(...args),
  fetchSubtopicsForTopic: (...args: unknown[]) => mockFetchSubtopics(...args),
  getFilteredCount: (...args: unknown[]) => mockGetFilteredCount(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { useQuizConfig } from './use-quiz-config'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-0000-0000-000000000001'
const TOPIC_ID = '00000000-0000-0000-0000-000000000002'
const SUBTOPIC_ID = '00000000-0000-0000-0000-000000000003'
const SESSION_ID = '00000000-0000-0000-0000-000000000099'

const SUBJECTS = [{ id: SUBJECT_ID, name: 'Air Law', code: 'ALW', short: 'ALW', questionCount: 30 }]

const TOPICS = [{ id: TOPIC_ID, name: 'Regulations', questionCount: 20 }]

const SUBTOPICS = [{ id: SUBTOPIC_ID, name: 'ICAO', questionCount: 8 }]

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockFetchTopics.mockResolvedValue(TOPICS)
  mockFetchSubtopics.mockResolvedValue(SUBTOPICS)
})

// ---- Initial state --------------------------------------------------------

describe('useQuizConfig — initial state', () => {
  it('starts with no subject selected and no error', () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.subjectId).toBe('')
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('starts with count 10 and filter "all"', () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.count).toBe(10)
    expect(result.current.filter).toBe('all')
  })
})

// ---- maxQuestions derivation ----------------------------------------------

describe('useQuizConfig — maxQuestions', () => {
  it('derives maxQuestions from subject questionCount when no topic is selected', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    // subject has 30 questions, capped at 50
    expect(result.current.maxQuestions).toBe(30)
  })

  it('derives maxQuestions from topic questionCount when a topic is selected', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      result.current.handleTopicChange(TOPIC_ID)
    })
    // topic has 20 questions
    expect(result.current.maxQuestions).toBe(20)
  })

  it('derives maxQuestions from subtopic questionCount when a subtopic is selected', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      result.current.handleTopicChange(TOPIC_ID)
    })
    await act(async () => {
      result.current.setSubtopicId(SUBTOPIC_ID)
    })
    // subtopic has 8 questions
    expect(result.current.maxQuestions).toBe(8)
  })

  it('caps maxQuestions at 50 when questionCount exceeds 50', async () => {
    const bigSubjects = [
      { id: SUBJECT_ID, name: 'Nav', code: 'NAV', short: 'NAV', questionCount: 200 },
    ]
    const { result } = renderHook(() => useQuizConfig({ subjects: bigSubjects }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    expect(result.current.maxQuestions).toBe(50)
  })
})

// ---- Cascade resets -------------------------------------------------------

describe('useQuizConfig — cascade resets', () => {
  it('resets topic and subtopic when subject changes', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      result.current.handleTopicChange(TOPIC_ID)
    })
    // Change subject — topic should clear
    await act(async () => {
      result.current.handleSubjectChange('')
    })
    expect(result.current.topicId).toBe('')
    expect(result.current.subtopicId).toBe('')
  })

  it('resets subtopic when topic changes', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      result.current.handleTopicChange(TOPIC_ID)
    })
    await act(async () => {
      result.current.setSubtopicId(SUBTOPIC_ID)
    })
    await act(async () => {
      result.current.handleTopicChange('')
    })
    expect(result.current.subtopicId).toBe('')
  })

  it('resets filteredCount to null when subject changes', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })

    // Establish a non-null filteredCount via a filter change
    mockGetFilteredCount.mockResolvedValue({ count: 7 })
    await act(async () => {
      result.current.setFilter('unseen')
    })
    expect(result.current.filteredCount).toBe(7)

    // Changing the subject must clear filteredCount immediately
    await act(async () => {
      result.current.handleSubjectChange('')
    })
    expect(result.current.filteredCount).toBeNull()
  })

  it('resets filteredCount to null when topic changes', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      result.current.handleTopicChange(TOPIC_ID)
    })

    // Establish a non-null filteredCount
    mockGetFilteredCount.mockResolvedValue({ count: 11 })
    await act(async () => {
      result.current.setFilter('incorrect')
    })
    expect(result.current.filteredCount).toBe(11)

    // Changing the topic must clear filteredCount immediately
    await act(async () => {
      result.current.handleTopicChange('')
    })
    expect(result.current.filteredCount).toBeNull()
  })
})

// ---- handleStart — happy path --------------------------------------------

describe('useQuizConfig — handleStart', () => {
  it('navigates to /app/quiz/session and stores session data on success', async () => {
    mockStartQuizSession.mockResolvedValue({
      success: true,
      sessionId: SESSION_ID,
      questionIds: ['q1', 'q2'],
    })

    const storage: Record<string, string> = {}
    vi.stubGlobal('sessionStorage', {
      setItem: (key: string, value: string) => {
        storage[key] = value
      },
      getItem: (key: string) => storage[key] ?? null,
    })

    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      await result.current.handleStart()
    })

    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
    expect(storage['quiz-session']).toContain(SESSION_ID)
  })

  it('stores subjectName and subjectCode in sessionStorage on success', async () => {
    mockStartQuizSession.mockResolvedValue({
      success: true,
      sessionId: SESSION_ID,
      questionIds: ['q1'],
    })

    const storage: Record<string, string> = {}
    vi.stubGlobal('sessionStorage', {
      setItem: (key: string, value: string) => {
        storage[key] = value
      },
      getItem: (key: string) => storage[key] ?? null,
    })

    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      await result.current.handleStart()
    })

    const stored = JSON.parse(storage['quiz-session'] ?? '{}') as Record<string, unknown>
    expect(stored.subjectName).toBe('Air Law')
    expect(stored.subjectCode).toBe('ALW')
  })

  it('does nothing when no subject is selected', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      await result.current.handleStart()
    })
    expect(mockStartQuizSession).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('sets error and clears loading when startQuizSession returns failure', async () => {
    mockStartQuizSession.mockResolvedValue({
      success: false,
      error: 'No questions available for this selection',
    })

    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      await result.current.handleStart()
    })

    expect(result.current.error).toBe('No questions available for this selection')
    expect(result.current.loading).toBe(false)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('sets a generic error and clears loading when startQuizSession throws', async () => {
    mockStartQuizSession.mockRejectedValue(new Error('network failure'))

    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      await result.current.handleStart()
    })

    expect(result.current.error).toBe('Something went wrong. Please try again.')
    expect(result.current.loading).toBe(false)
  })

  it('clamps count to maxQuestions when submitting', async () => {
    mockStartQuizSession.mockResolvedValue({
      success: true,
      sessionId: SESSION_ID,
      questionIds: ['q1'],
    })

    vi.stubGlobal('sessionStorage', { setItem: vi.fn(), getItem: vi.fn() })

    // Subject has 8 questions; user somehow has count set to 30
    const smallSubjects = [
      { id: SUBJECT_ID, name: 'Test', code: 'TST', short: 'TST', questionCount: 8 },
    ]
    const { result } = renderHook(() => useQuizConfig({ subjects: smallSubjects }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
      result.current.setCount(30)
    })
    await act(async () => {
      await result.current.handleStart()
    })

    const callArg = mockStartQuizSession.mock.calls[0]?.[0] as { count: number }
    expect(callArg.count).toBe(8)
  })
})

// ---- handleFilterChange --------------------------------------------------

describe('useQuizConfig — handleFilterChange', () => {
  it('updates filter state immediately', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })

    mockGetFilteredCount.mockResolvedValue({ count: 12 })

    await act(async () => {
      result.current.setFilter('unseen')
    })

    expect(result.current.filter).toBe('unseen')
  })

  it('fetches filtered count when a subject is selected', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })

    mockGetFilteredCount.mockResolvedValue({ count: 15 })

    await act(async () => {
      result.current.setFilter('unseen')
    })

    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: SUBJECT_ID, filter: 'unseen' }),
    )
    expect(result.current.filteredCount).toBe(15)
  })

  it('does not fetch filtered count when no subject is selected', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))

    await act(async () => {
      result.current.setFilter('unseen')
    })

    expect(mockGetFilteredCount).not.toHaveBeenCalled()
    expect(result.current.filteredCount).toBeNull()
  })

  it('sets filteredCount to null immediately while a fetch is in flight', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })

    // Set an initial value via a first filter change
    mockGetFilteredCount.mockResolvedValue({ count: 5 })
    await act(async () => {
      result.current.setFilter('unseen')
    })
    expect(result.current.filteredCount).toBe(5)

    // Start a second filter change — filteredCount resets to null synchronously
    let resolveSecond!: (v: { count: number }) => void
    const secondPromise = new Promise<{ count: number }>((res) => {
      resolveSecond = res
    })
    mockGetFilteredCount.mockReturnValueOnce(secondPromise)

    act(() => {
      result.current.setFilter('incorrect')
    })

    // filteredCount is null while fetch is pending
    expect(result.current.filteredCount).toBeNull()

    // Resolve the in-flight fetch
    await act(async () => {
      resolveSecond({ count: 3 })
    })
    expect(result.current.filteredCount).toBe(3)
  })

  it('ignores a stale filter count when a newer filter change resolves first', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })

    // First filter change — slow
    let resolveSlowFetch!: (v: { count: number }) => void
    const slowPromise = new Promise<{ count: number }>((res) => {
      resolveSlowFetch = res
    })
    mockGetFilteredCount
      .mockReturnValueOnce(slowPromise) // 'incorrect' filter — slow
      .mockResolvedValueOnce({ count: 18 }) // 'unseen' filter — fast

    act(() => {
      result.current.setFilter('incorrect')
    })

    // Second filter change overtakes the first
    await act(async () => {
      result.current.setFilter('unseen')
    })

    expect(result.current.filteredCount).toBe(18)

    // Resolve the slow first fetch — stale, must be ignored
    await act(async () => {
      resolveSlowFetch({ count: 999 })
    })

    expect(result.current.filteredCount).toBe(18)
    expect(result.current.filter).toBe('unseen')
  })
})
