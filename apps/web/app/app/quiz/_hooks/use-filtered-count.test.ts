import { act, renderHook } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetFilteredCount } = vi.hoisted(() => ({
  mockGetFilteredCount: vi.fn(),
}))

vi.mock('../actions/lookup', () => ({
  getFilteredCount: (...args: unknown[]) => mockGetFilteredCount(...args),
}))

// ---- Subject under test ---------------------------------------------------

import type { QuestionFilterValue, QuizSetupPreload } from '../types'
import { useFilteredCount } from './use-filtered-count'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const TOPIC_ID = '00000000-0000-4000-b000-000000000001'
const TOPIC_IDS: string[] = [TOPIC_ID]
const SUBTOPIC_IDS: string[] = ['00000000-0000-4000-c000-000000000001']

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Initial state --------------------------------------------------------

describe('useFilteredCount — initial state', () => {
  it('starts with all counts null and no pending fetch', () => {
    const { result } = renderHook(() => useFilteredCount())
    expect(result.current.filteredCount).toBeNull()
    expect(result.current.filteredByTopic).toBeNull()
    expect(result.current.filteredBySubtopic).toBeNull()
    expect(result.current.isFilterPending).toBe(false)
    expect(result.current.authError).toBe(false)
  })
})

// ---- refetch ---------------------------------------------------------------

describe('useFilteredCount — refetch', () => {
  it('fetches count and updates state when subject and non-all filters are provided', async () => {
    mockGetFilteredCount.mockResolvedValue({
      count: 12,
      byTopic: { [TOPIC_ID]: 12 },
      bySubtopic: {},
    })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['unseen'])
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: SUBJECT_ID,
        topicIds: TOPIC_IDS,
        subtopicIds: SUBTOPIC_IDS,
        filters: ['unseen'],
        calcMode: 'all',
      }),
    )
    expect(result.current.filteredCount).toBe(12)
    expect(result.current.filteredByTopic).toEqual({ [TOPIC_ID]: 12 })
    expect(result.current.filteredBySubtopic).toEqual({})
  })

  it('does not call getFilteredCount when subjectId is empty', async () => {
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch('', TOPIC_IDS, SUBTOPIC_IDS, ['unseen'])
    })
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
    expect(result.current.filteredCount).toBeNull()
  })

  it('does not call getFilteredCount when filters contain only [all]', async () => {
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['all'])
    })
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
    expect(result.current.filteredCount).toBeNull()
  })

  it('strips [all] from mixed filter arrays before calling getFilteredCount', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 5, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['all', 'unseen'])
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['unseen'] }),
    )
  })

  it('resets counts to null before the fetch resolves', async () => {
    // Pre-populate state with a resolved fetch
    mockGetFilteredCount.mockResolvedValueOnce({ count: 10, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['incorrect'])
    })
    expect(result.current.filteredCount).toBe(10)

    // Next fetch never resolves — counts should be null during pending
    mockGetFilteredCount.mockReturnValueOnce(new Promise(() => {}))
    act(() => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['flagged'])
    })
    expect(result.current.filteredCount).toBeNull()
  })

  it('preserves the existing count when subjectId is empty', async () => {
    mockGetFilteredCount.mockResolvedValueOnce({ count: 10, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })
    expect(result.current.filteredCount).toBe(10)

    // Empty subjectId should NOT wipe the existing count
    await act(async () => {
      result.current.refetch('', TOPIC_IDS, [], ['unseen'])
    })
    expect(result.current.filteredCount).toBe(10)
    expect(mockGetFilteredCount).toHaveBeenCalledTimes(1)
  })

  it('preserves the existing count when only all-filters are applied', async () => {
    mockGetFilteredCount.mockResolvedValueOnce({ count: 10, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })
    expect(result.current.filteredCount).toBe(10)

    // all-only filters should NOT wipe the existing count
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['all'])
    })
    expect(result.current.filteredCount).toBe(10)
    expect(mockGetFilteredCount).toHaveBeenCalledTimes(1)
  })
})

// ---- calcMode -------------------------------------------------------------

describe('useFilteredCount — calcMode', () => {
  it('fetches when calcMode is only even with no active switch-filters', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 4, byTopic: { [TOPIC_ID]: 4 }, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['all'], 'only')
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [], calcMode: 'only' }),
    )
    expect(result.current.filteredCount).toBe(4)
  })

  it('fetches when calcMode is exclude even with no active switch-filters', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 6, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['all'], 'exclude')
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [], calcMode: 'exclude' }),
    )
  })

  it('does not fetch when calcMode is all and no switch-filters are active', async () => {
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['all'], 'all')
    })
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
  })

  it('passes calcMode through alongside an active switch-filter', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 2, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['unseen'], 'exclude')
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['unseen'], calcMode: 'exclude' }),
    )
  })
})

// ---- imageMode ------------------------------------------------------------

describe('useFilteredCount — imageMode', () => {
  it('fetches when imageMode is only even with no active switch-filters', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 5, byTopic: { [TOPIC_ID]: 5 }, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['all'], 'all', 'only')
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [], imageMode: 'only' }),
    )
    expect(result.current.filteredCount).toBe(5)
  })

  it('fetches when imageMode is exclude even with no active switch-filters', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 3, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['all'], 'all', 'exclude')
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [], imageMode: 'exclude' }),
    )
  })

  it('does not fetch when imageMode is all and no other filters are active', async () => {
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['all'], 'all', 'all')
    })
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
  })

  it('passes imageMode through alongside an active switch-filter', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 2, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['unseen'], 'all', 'exclude')
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['unseen'], imageMode: 'exclude' }),
    )
  })
})

// ---- questionType ----------------------------------------------------------

describe('useFilteredCount — questionType', () => {
  it('counts only multiple-choice questions on the Study/Discovery path', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 8, byTopic: { [TOPIC_ID]: 8 }, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(
        SUBJECT_ID,
        TOPIC_IDS,
        SUBTOPIC_IDS,
        ['unseen'],
        'all',
        'all',
        'multiple_choice',
      )
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ questionType: 'multiple_choice' }),
    )
    expect(result.current.filteredCount).toBe(8)
  })

  it('counts the multiple-choice pool when questionType is set even with no active filter', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 6, byTopic: { [TOPIC_ID]: 6 }, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      // No switch-filter, calc/image both 'all' — only questionType restricts the pool.
      result.current.refetch(
        SUBJECT_ID,
        TOPIC_IDS,
        SUBTOPIC_IDS,
        ['all'],
        'all',
        'all',
        'multiple_choice',
      )
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [], questionType: 'multiple_choice' }),
    )
    expect(result.current.filteredCount).toBe(6)
  })

  it('does not fetch when no questionType and no active filter/calc/image are set', async () => {
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['all'], 'all', 'all', undefined)
    })
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
  })

  it('omits questionType (undefined) on the type-agnostic quiz/exam count path', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 3, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ['unseen'])
    })
    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ questionType: undefined }),
    )
  })
})

// ---- Auth error -----------------------------------------------------------

describe('useFilteredCount — auth error', () => {
  it('sets authError when server returns auth error', async () => {
    mockGetFilteredCount.mockResolvedValue({
      count: 0,
      byTopic: {},
      bySubtopic: {},
      error: 'auth',
    })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })
    expect(result.current.authError).toBe(true)
    expect(result.current.filteredCount).toBeNull()
  })

  it('clears authError on reset', async () => {
    mockGetFilteredCount.mockResolvedValue({
      count: 0,
      byTopic: {},
      bySubtopic: {},
      error: 'auth',
    })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })
    expect(result.current.authError).toBe(true)

    act(() => {
      result.current.reset()
    })
    expect(result.current.authError).toBe(false)
  })

  it('clears authError on successful refetch', async () => {
    // First: auth error
    mockGetFilteredCount.mockResolvedValueOnce({
      count: 0,
      byTopic: {},
      bySubtopic: {},
      error: 'auth',
    })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })
    expect(result.current.authError).toBe(true)

    // Second: successful fetch
    mockGetFilteredCount.mockResolvedValueOnce({ count: 5, byTopic: {}, bySubtopic: {} })
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })
    expect(result.current.authError).toBe(false)
    expect(result.current.filteredCount).toBe(5)
  })

  it('clears isFilterPending after an auth error response', async () => {
    mockGetFilteredCount.mockResolvedValue({
      count: 0,
      byTopic: {},
      bySubtopic: {},
      error: 'auth',
    })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })
    // .finally() must fire even when the auth path returns early in .then()
    expect(result.current.isFilterPending).toBe(false)
    expect(result.current.authError).toBe(true)
  })
})

// ---- Stale-closure guard --------------------------------------------------

describe('useFilteredCount — stale-closure guard', () => {
  it('ignores results from a superseded fetch', async () => {
    let resolveFirst!: (v: unknown) => void
    const firstFetch = new Promise((res) => {
      resolveFirst = res
    })
    const secondResult = { count: 99, byTopic: {}, bySubtopic: {} }

    mockGetFilteredCount.mockReturnValueOnce(firstFetch).mockResolvedValueOnce(secondResult)

    const { result } = renderHook(() => useFilteredCount())

    // Start first fetch (won't resolve yet)
    act(() => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })

    // Start second fetch (resolves immediately)
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['incorrect'])
    })

    // Now resolve the first fetch — should be ignored
    await act(async () => {
      resolveFirst({ count: 1, byTopic: {}, bySubtopic: {} })
    })

    // State should reflect the second fetch result, not the stale first one
    expect(result.current.filteredCount).toBe(99)
  })

  it('does not set authError when a stale fetch returns an auth error', async () => {
    let resolveFirst!: (v: unknown) => void
    const firstFetch = new Promise((res) => {
      resolveFirst = res
    })
    const secondResult = { count: 5, byTopic: {}, bySubtopic: {} }

    mockGetFilteredCount.mockReturnValueOnce(firstFetch).mockResolvedValueOnce(secondResult)

    const { result } = renderHook(() => useFilteredCount())

    // Start first fetch (won't resolve yet)
    act(() => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })

    // Second fetch resolves successfully — supersedes the first
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['incorrect'])
    })
    expect(result.current.filteredCount).toBe(5)

    // Stale first fetch now resolves with an auth error — must be ignored
    await act(async () => {
      resolveFirst({ count: 0, byTopic: {}, bySubtopic: {}, error: 'auth' })
    })

    expect(result.current.authError).toBe(false)
    expect(result.current.filteredCount).toBe(5)
  })
})

// ---- reset ----------------------------------------------------------------

describe('useFilteredCount — reset', () => {
  it('clears all count state to null', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 7, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })
    expect(result.current.filteredCount).toBe(7)

    act(() => {
      result.current.reset()
    })
    expect(result.current.filteredCount).toBeNull()
    expect(result.current.filteredByTopic).toBeNull()
    expect(result.current.filteredBySubtopic).toBeNull()
  })
})

// ---- stale-while-revalidate on refetch -------------------------------------

describe('useFilteredCount — same-key refetch after a new preload', () => {
  const EMPTY = (): QuizSetupPreload => ({ topicsBySubject: {}, discoveryCounts: {} })
  const FLAGGED = ['flagged'] as QuestionFilterValue[]

  function setup(filters: QuestionFilterValue[]) {
    return renderHook(
      ({ p, f }) => {
        const fc = useFilteredCount(p)
        const { refetch } = fc
        useEffect(() => {
          refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, f, 'all', 'all', 'multiple_choice')
        }, [refetch, f])
        return fc
      },
      { initialProps: { p: Promise.resolve(EMPTY()), f: filters } },
    )
  }

  it('keeps the current counts, not pending, while the revalidating request runs', async () => {
    mockGetFilteredCount.mockResolvedValueOnce({ count: 2, byTopic: {}, bySubtopic: {} })
    const { result, rerender } = setup(FLAGGED)
    await act(async () => undefined)
    expect(result.current.filteredCount).toBe(2)

    let resolveFetch: (v: unknown) => void = () => undefined
    mockGetFilteredCount.mockReturnValueOnce(
      new Promise((r) => {
        resolveFetch = r
      }),
    )
    rerender({ p: Promise.resolve(EMPTY()), f: FLAGGED })
    await act(async () => undefined)

    expect(mockGetFilteredCount).toHaveBeenCalledTimes(2)
    expect(result.current.filteredCount).toBe(2)
    expect(result.current.isFilterPending).toBe(false)

    await act(async () => {
      resolveFetch({ count: 5, byTopic: {}, bySubtopic: {} })
    })
    expect(result.current.filteredCount).toBe(5)
  })

  it('resets to null and pending when the key changed', async () => {
    mockGetFilteredCount.mockResolvedValueOnce({ count: 2, byTopic: {}, bySubtopic: {} })
    const { result, rerender } = setup(FLAGGED)
    await act(async () => undefined)

    mockGetFilteredCount.mockReturnValueOnce(new Promise(() => undefined))
    rerender({ p: Promise.resolve(EMPTY()), f: ['unseen'] as QuestionFilterValue[] })
    await act(async () => undefined)

    expect(result.current.filteredCount).toBeNull()
    expect(result.current.isFilterPending).toBe(true)
  })
})

// ---- same-key refetch after a failed request (AC13) ------------------------

describe('useFilteredCount — same-key refetch after a failed request', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })
  const OK = { count: 7, byTopic: {}, bySubtopic: {} }
  const AUTH = { count: 0, byTopic: {}, bySubtopic: {}, error: 'auth' }
  const call = (r: { current: ReturnType<typeof useFilteredCount> }) =>
    r.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])

  it('blanks counts and shows pending on a same-key refetch after an auth result for the first call', async () => {
    mockGetFilteredCount.mockResolvedValueOnce(AUTH)
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => call(result))
    mockGetFilteredCount.mockReturnValueOnce(new Promise(() => undefined))
    act(() => call(result))
    expect(result.current.isFilterPending).toBe(true)
    expect(result.current.filteredCount).toBeNull()
  })

  it('blanks counts and shows pending on a same-key refetch after a rejection for the first call', async () => {
    mockGetFilteredCount.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => call(result))
    mockGetFilteredCount.mockReturnValueOnce(new Promise(() => undefined))
    act(() => call(result))
    expect(result.current.isFilterPending).toBe(true)
    expect(result.current.filteredCount).toBeNull()
  })

  it('blanks shown counts and shows pending after a same-key revalidation returned auth', async () => {
    mockGetFilteredCount.mockResolvedValueOnce(OK).mockResolvedValueOnce(AUTH)
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => call(result))
    expect(result.current.filteredCount).toBe(7)
    await act(async () => call(result))
    mockGetFilteredCount.mockReturnValueOnce(new Promise(() => undefined))
    act(() => call(result))
    expect(result.current.isFilterPending).toBe(true)
    expect(result.current.filteredCount).toBeNull()
  })

  it('blanks shown counts and shows pending after a same-key revalidation rejected', async () => {
    mockGetFilteredCount.mockResolvedValueOnce(OK).mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => call(result))
    expect(result.current.filteredCount).toBe(7)
    await act(async () => call(result))
    mockGetFilteredCount.mockReturnValueOnce(new Promise(() => undefined))
    act(() => call(result))
    expect(result.current.isFilterPending).toBe(true)
    expect(result.current.filteredCount).toBeNull()
  })
})

// ---- rejected request logs (AC14) -------------------------------------------

describe('useFilteredCount — rejected count request', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('logs a tagged console.error once with the error and clears pending when getFilteredCount rejects', async () => {
    const err = new Error('network')
    mockGetFilteredCount.mockRejectedValueOnce(err)
    const { result } = renderHook(() => useFilteredCount())
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'])
    })
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      '[useFilteredCount] count request failed:',
      err,
    )
    expect(result.current.isFilterPending).toBe(false)
  })
})
