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

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const TOPIC_ID = '00000000-0000-4000-b000-000000000001'
const TOPIC_IDS: string[] = [TOPIC_ID]
const SUBTOPIC_IDS: string[] = ['00000000-0000-4000-c000-000000000001']

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- preloaded Discovery counts -------------------------------------------

describe('useFilteredCount — preloaded Discovery counts', () => {
  const PRELOADED = {
    [SUBJECT_ID]: { count: 31, byTopic: { [TOPIC_ID]: 31 }, bySubtopic: { sub: 4 } },
  }

  it('shows the preloaded counts for the Discovery defaults without a request', async () => {
    const { result } = renderHook(() => useFilteredCount(PRELOADED))
    await act(async () => {
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
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
    expect(result.current.filteredCount).toBe(31)
    expect(result.current.filteredByTopic).toEqual({ [TOPIC_ID]: 31 })
    expect(result.current.filteredBySubtopic).toEqual({ sub: 4 })
    expect(result.current.isFilterPending).toBe(false)
  })

  it('asks the server when a student filter is active', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 2, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount(PRELOADED))
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
    expect(mockGetFilteredCount).toHaveBeenCalledTimes(1)
    expect(result.current.filteredCount).toBe(2)
  })

  it('asks the server for a subject that was not preloaded', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 9, byTopic: {}, bySubtopic: {} })
    const { result } = renderHook(() => useFilteredCount({}))
    await act(async () => {
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
    expect(mockGetFilteredCount).toHaveBeenCalledTimes(1)
    expect(result.current.filteredCount).toBe(9)
  })

  it('ignores the result of a request that was still pending when preloaded counts arrived', async () => {
    let resolveFetch: (v: unknown) => void = () => undefined
    mockGetFilteredCount.mockReturnValue(
      new Promise((r) => {
        resolveFetch = r
      }),
    )
    const { result } = renderHook(() => useFilteredCount(PRELOADED))
    await act(async () => {
      result.current.refetch(SUBJECT_ID, TOPIC_IDS, [], ['unseen'], 'all', 'all', 'multiple_choice')
    })
    await act(async () => {
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
    await act(async () => {
      resolveFetch({ count: 1, byTopic: {}, bySubtopic: {} })
    })
    expect(result.current.filteredCount).toBe(31)
    expect(result.current.isFilterPending).toBe(false)
  })
})
