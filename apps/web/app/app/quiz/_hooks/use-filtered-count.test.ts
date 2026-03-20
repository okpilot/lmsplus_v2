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

import type { QuestionFilterValue } from '../types'
import { useFilteredCount } from './use-filtered-count'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'

const FILTER_RESULT = {
  count: 17,
  byTopic: { 'topic-1': 10, 'topic-2': 7 },
  bySubtopic: { 'subtopic-a': 5, 'subtopic-b': 12 },
}

function makeTopicTree(overrides?: { topicIds?: string[]; subtopicIds?: string[] }) {
  return {
    getSelectedTopicIds: vi.fn(() => overrides?.topicIds ?? []),
    getSelectedSubtopicIds: vi.fn(() => overrides?.subtopicIds ?? []),
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- hasActiveFilters -----------------------------------------------------

describe('useFilteredCount — hasActiveFilters', () => {
  it('is false when filters is ["all"]', () => {
    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['all'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    expect(result.current.hasActiveFilters).toBe(false)
  })

  it('is true when filters contains a non-all value', () => {
    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['unseen'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    expect(result.current.hasActiveFilters).toBe(true)
  })

  it('is true when filters contains multiple non-all values', () => {
    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['incorrect', 'flagged'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    expect(result.current.hasActiveFilters).toBe(true)
  })
})

// ---- initial state --------------------------------------------------------

describe('useFilteredCount — initial state', () => {
  it('starts with null filteredCount, byTopic, and bySubtopic', () => {
    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['all'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    expect(result.current.filteredCount).toBeNull()
    expect(result.current.filteredByTopic).toBeNull()
    expect(result.current.filteredBySubtopic).toBeNull()
  })
})

// ---- refetchFilteredCount — skip conditions --------------------------------

describe('useFilteredCount — refetchFilteredCount skips fetch', () => {
  it('does not call getFilteredCount when subjectId is empty', async () => {
    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: '',
        filters: ['unseen'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    await act(async () => {
      result.current.refetchFilteredCount()
    })
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
  })

  it('does not call getFilteredCount when all filters are "all"', async () => {
    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['all'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    await act(async () => {
      result.current.refetchFilteredCount()
    })
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
  })

  it('does not call getFilteredCount when overriding with only ["all"] filter', async () => {
    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['unseen'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    await act(async () => {
      result.current.refetchFilteredCount(['all'] as QuestionFilterValue[])
    })
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
  })
})

// ---- refetchFilteredCount — successful fetch --------------------------------

describe('useFilteredCount — refetchFilteredCount successful fetch', () => {
  it('calls getFilteredCount with subjectId, topicIds, subtopicIds, and active filters', async () => {
    const topicTree = makeTopicTree({ topicIds: ['t1'], subtopicIds: ['s1', 's2'] })
    mockGetFilteredCount.mockResolvedValue(FILTER_RESULT)

    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['incorrect'] as QuestionFilterValue[],
        topicTree,
      }),
    )
    await act(async () => {
      result.current.refetchFilteredCount()
    })

    expect(mockGetFilteredCount).toHaveBeenCalledWith({
      subjectId: SUBJECT_ID,
      topicIds: ['t1'],
      subtopicIds: ['s1', 's2'],
      filters: ['incorrect'],
    })
  })

  it('sets filteredCount, filteredByTopic, and filteredBySubtopic from the resolved result', async () => {
    mockGetFilteredCount.mockResolvedValue(FILTER_RESULT)

    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['unseen'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    await act(async () => {
      result.current.refetchFilteredCount()
    })

    expect(result.current.filteredCount).toBe(17)
    expect(result.current.filteredByTopic).toEqual({ 'topic-1': 10, 'topic-2': 7 })
    expect(result.current.filteredBySubtopic).toEqual({ 'subtopic-a': 5, 'subtopic-b': 12 })
  })

  it('resets counts to null at the start of each fetch', async () => {
    // First fetch resolves immediately
    mockGetFilteredCount.mockResolvedValueOnce(FILTER_RESULT)
    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['unseen'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    await act(async () => {
      result.current.refetchFilteredCount()
    })
    expect(result.current.filteredCount).toBe(17)

    // Second fetch: immediately after calling, counts should be null again
    // (before the promise settles)
    let resolveSecond!: (v: typeof FILTER_RESULT) => void
    mockGetFilteredCount.mockReturnValueOnce(
      new Promise<typeof FILTER_RESULT>((res) => {
        resolveSecond = res
      }),
    )
    act(() => {
      result.current.refetchFilteredCount()
    })
    // Counts reset to null while pending
    expect(result.current.filteredCount).toBeNull()
    expect(result.current.filteredByTopic).toBeNull()
    expect(result.current.filteredBySubtopic).toBeNull()

    // Resolve and verify final state
    await act(async () => {
      resolveSecond({
        count: 5,
        byTopic: { 'topic-1': 3, 'topic-2': 2 },
        bySubtopic: { 'subtopic-a': 2, 'subtopic-b': 3 },
      })
    })
    expect(result.current.filteredCount).toBe(5)
  })

  it('uses the override filters argument when provided', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 3, byTopic: {}, bySubtopic: {} })

    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['all'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )
    await act(async () => {
      result.current.refetchFilteredCount(['flagged'] as QuestionFilterValue[])
    })

    expect(mockGetFilteredCount).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['flagged'] }),
    )
  })
})

// ---- stale response guard -------------------------------------------------

describe('useFilteredCount — stale response guard', () => {
  it('ignores results from a superseded fetch when a newer fetch completes first', async () => {
    // fetch-1 is slow, fetch-2 is fast
    let resolveFetch1!: (v: typeof FILTER_RESULT) => void
    mockGetFilteredCount
      .mockReturnValueOnce(
        new Promise<typeof FILTER_RESULT>((res) => {
          resolveFetch1 = res
        }),
      )
      .mockResolvedValueOnce({ count: 99, byTopic: {}, bySubtopic: {} })

    const { result } = renderHook(() =>
      useFilteredCount({
        subjectId: SUBJECT_ID,
        filters: ['unseen'] as QuestionFilterValue[],
        topicTree: makeTopicTree(),
      }),
    )

    // Start fetch-1 (slow)
    act(() => {
      result.current.refetchFilteredCount()
    })

    // Start fetch-2 (fast) — advances the generation counter
    await act(async () => {
      result.current.refetchFilteredCount()
    })
    // fetch-2 resolved with count 99
    expect(result.current.filteredCount).toBe(99)

    // fetch-1 resolves late — should be ignored (stale generation)
    await act(async () => {
      resolveFetch1(FILTER_RESULT)
    })
    // count remains 99, not 17 from the stale fetch
    expect(result.current.filteredCount).toBe(99)
  })
})
