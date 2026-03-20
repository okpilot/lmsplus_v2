import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetFilteredCount } = vi.hoisted(() => ({
  mockGetFilteredCount: vi.fn(),
}))

vi.mock('../actions/lookup', () => ({
  getFilteredCount: (...args: unknown[]) => mockGetFilteredCount(...args),
}))

// ---- Subject under test ---------------------------------------------------

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

  it('preserves existing count when guard returns early (no subjectId)', async () => {
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

  it('preserves existing count when guard returns early (all-only filters)', async () => {
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
