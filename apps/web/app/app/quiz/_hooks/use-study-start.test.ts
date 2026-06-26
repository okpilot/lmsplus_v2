import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockStartStudy } = vi.hoisted(() => ({
  mockStartStudy: vi.fn(),
}))

vi.mock('../actions/study', () => ({
  startStudy: (...args: unknown[]) => mockStartStudy(...args),
}))

// ---- Subject under test ---------------------------------------------------

import type { StudyQuestion } from '@/lib/queries/study-queries'
import { useStudyStart } from './use-study-start'

// ---- Fixtures -------------------------------------------------------------

const VALID_INPUT = {
  subjectId: '00000000-0000-4000-a000-000000000001',
  count: 10,
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
  mockStartStudy.mockResolvedValue({ success: true, questions: [makeQuestion()] })
})

// ---- Initial state -------------------------------------------------------

describe('useStudyStart — initial state', () => {
  it('starts with null questions, no loading, and no error', () => {
    const { result } = renderHook(() => useStudyStart())
    expect(result.current.questions).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

// ---- start — guards ------------------------------------------------------

describe('useStudyStart — start guards', () => {
  it('does not call the action when subjectId is empty', async () => {
    const { result } = renderHook(() => useStudyStart())
    await act(async () => result.current.start({ ...VALID_INPUT, subjectId: '' }))
    expect(mockStartStudy).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('ignores a second call while a start is already in progress', async () => {
    let resolveFirst!: (v: { success: true; questions: StudyQuestion[] }) => void
    mockStartStudy.mockReturnValueOnce(
      new Promise<{ success: true; questions: StudyQuestion[] }>((res) => {
        resolveFirst = res
      }),
    )

    const { result } = renderHook(() => useStudyStart())

    // Fire first call — loading is true, promise is pending.
    act(() => {
      void result.current.start(VALID_INPUT)
    })

    // Fire second call while first is still in flight.
    await act(async () => result.current.start(VALID_INPUT))

    expect(mockStartStudy).toHaveBeenCalledTimes(1)

    // Settle the first call so the hook can clean up.
    await act(async () => {
      resolveFirst({ success: true, questions: [makeQuestion()] })
    })
  })
})

// ---- start — happy path --------------------------------------------------

describe('useStudyStart — start happy path', () => {
  it('populates questions after a successful start', async () => {
    const q = makeQuestion()
    mockStartStudy.mockResolvedValue({ success: true, questions: [q] })
    const { result } = renderHook(() => useStudyStart())
    await act(async () => result.current.start(VALID_INPUT))
    expect(result.current.questions).toEqual([q])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets questions to an empty array when the action returns zero results', async () => {
    mockStartStudy.mockResolvedValue({ success: true, questions: [] })
    const { result } = renderHook(() => useStudyStart())
    await act(async () => result.current.start(VALID_INPUT))
    expect(result.current.questions).toEqual([])
  })
})

// ---- start — failure path ------------------------------------------------

describe('useStudyStart — start failure path', () => {
  it('sets the error field and leaves questions null when the action returns a failure', async () => {
    mockStartStudy.mockResolvedValue({ success: false, error: 'No questions found' })
    const { result } = renderHook(() => useStudyStart())
    await act(async () => result.current.start(VALID_INPUT))
    expect(result.current.questions).toBeNull()
    expect(result.current.error).toBe('No questions found')
    expect(result.current.loading).toBe(false)
  })

  it('sets a fallback error when the action throws', async () => {
    mockStartStudy.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useStudyStart())
    await act(async () => result.current.start(VALID_INPUT))
    expect(result.current.error).toBe('Something went wrong. Please try again.')
    expect(result.current.loading).toBe(false)
    expect(result.current.questions).toBeNull()
  })

  it('clears loading state after a failed call', async () => {
    mockStartStudy.mockResolvedValue({ success: false, error: 'Not authenticated' })
    const { result } = renderHook(() => useStudyStart())
    await act(async () => result.current.start(VALID_INPUT))
    expect(result.current.loading).toBe(false)
  })
})

// ---- reset ---------------------------------------------------------------

describe('useStudyStart — reset', () => {
  it('resets questions and error to their initial values', async () => {
    // Bring the hook into a loaded state first.
    const { result } = renderHook(() => useStudyStart())
    await act(async () => result.current.start(VALID_INPUT))
    expect(result.current.questions).not.toBeNull()

    act(() => result.current.reset())
    expect(result.current.questions).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('clears an error set by a failed start', async () => {
    mockStartStudy.mockResolvedValue({ success: false, error: 'Something failed' })
    const { result } = renderHook(() => useStudyStart())
    await act(async () => result.current.start(VALID_INPUT))
    expect(result.current.error).toBe('Something failed')

    act(() => result.current.reset())
    expect(result.current.error).toBeNull()
  })
})
