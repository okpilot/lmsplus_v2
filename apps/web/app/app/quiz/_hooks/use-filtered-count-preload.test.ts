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

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const TOPIC_ID = '00000000-0000-4000-b000-000000000001'
const TOPIC_IDS: string[] = [TOPIC_ID]
const SUBTOPIC_IDS: string[] = ['00000000-0000-4000-c000-000000000001']

beforeEach(() => {
  vi.resetAllMocks()
  mockGetFilteredCount.mockResolvedValue({ count: -1, byTopic: {}, bySubtopic: {} })
})

// ---- preloaded Discovery counts -------------------------------------------

const ALL = ['all'] as QuestionFilterValue[]
const NONE = { count: 31, byTopic: { [TOPIC_ID]: 31 }, bySubtopic: { sub: 4 } }
const UNSEEN = { count: 12, byTopic: { [TOPIC_ID]: 12 }, bySubtopic: {} }
const SETUP: QuizSetupPreload = {
  topicsBySubject: {},
  discoveryCounts: { [SUBJECT_ID]: { '': NONE, unseen: UNSEEN } },
}

function discoveryRefetch(
  result: { current: ReturnType<typeof useFilteredCount> },
  filters: QuestionFilterValue[],
) {
  result.current.refetch(
    SUBJECT_ID,
    TOPIC_IDS,
    SUBTOPIC_IDS,
    filters,
    'all',
    'all',
    'multiple_choice',
  )
}

async function renderResolved(setup: QuizSetupPreload = SETUP) {
  const preload = Promise.resolve(setup)
  const hook = renderHook(() => useFilteredCount(preload))
  await act(async () => undefined)
  return hook
}

describe('useFilteredCount — preloaded Discovery counts', () => {
  it('shows the preloaded counts for the Discovery defaults without a request', async () => {
    const { result } = await renderResolved()
    await act(async () => discoveryRefetch(result, ALL))
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
    expect(result.current.filteredCount).toBe(31)
    expect(result.current.filteredByTopic).toEqual({ [TOPIC_ID]: 31 })
    expect(result.current.filteredBySubtopic).toEqual({ sub: 4 })
    expect(result.current.isFilterPending).toBe(false)
  })

  it('shows the preloaded counts of a toggled student filter without a request', async () => {
    const { result } = await renderResolved()
    await act(async () => discoveryRefetch(result, ['unseen']))
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
    expect(result.current.filteredCount).toBe(12)
    expect(result.current.isFilterPending).toBe(false)
  })

  it('asks the server for a filter set that was not preloaded', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 2, byTopic: {}, bySubtopic: {} })
    const { result } = await renderResolved()
    await act(async () => discoveryRefetch(result, ['flagged']))
    expect(mockGetFilteredCount).toHaveBeenCalledTimes(1)
    expect(result.current.filteredCount).toBe(2)
  })

  it('asks the server for a subject that was not preloaded', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 9, byTopic: {}, bySubtopic: {} })
    const { result } = await renderResolved({ topicsBySubject: {}, discoveryCounts: {} })
    await act(async () => discoveryRefetch(result, ALL))
    expect(mockGetFilteredCount).toHaveBeenCalledTimes(1)
    expect(result.current.filteredCount).toBe(9)
  })

  it('asks the server while the preload has not arrived yet', async () => {
    mockGetFilteredCount.mockResolvedValue({ count: 9, byTopic: {}, bySubtopic: {} })
    const never = new Promise<QuizSetupPreload>(() => undefined)
    const { result } = renderHook(() => useFilteredCount(never))
    await act(async () => discoveryRefetch(result, ALL))
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
    const { result } = await renderResolved()
    await act(async () => discoveryRefetch(result, ['flagged']))
    await act(async () => discoveryRefetch(result, ALL))
    await act(async () => {
      resolveFetch({ count: 1, byTopic: {}, bySubtopic: {} })
    })
    expect(result.current.filteredCount).toBe(31)
    expect(result.current.isFilterPending).toBe(false)
  })
})

describe('useFilteredCount — preloaded counts never expire', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses preloaded counts of a toggled set 10 minutes later without a request', async () => {
    vi.useFakeTimers({ now: 50_000 })
    const { result } = await renderResolved()
    vi.setSystemTime(50_000 + 600_000)

    await act(async () => discoveryRefetch(result, ['unseen']))

    expect(mockGetFilteredCount).not.toHaveBeenCalled()
    expect(result.current.filteredCount).toBe(12)
  })

  it('uses preloaded counts on a remount of an old preload without a request', async () => {
    vi.useFakeTimers({ now: 50_000 })
    const preload = Promise.resolve(SETUP)
    const first = renderHook(() => useFilteredCount(preload))
    await act(async () => undefined)
    first.unmount()
    vi.setSystemTime(50_000 + 600_000)

    const { result } = renderHook(() => useFilteredCount(preload))
    await act(async () => undefined)
    await act(async () => discoveryRefetch(result, ALL))

    expect(mockGetFilteredCount).not.toHaveBeenCalled()
    expect(result.current.filteredCount).toBe(31)
  })
})

describe('useFilteredCount — new preload after a refresh', () => {
  it('shows the new promise counts for the current selection without a request', async () => {
    const REFRESHED = {
      topicsBySubject: {},
      discoveryCounts: {
        [SUBJECT_ID]: {
          '': { count: 40, byTopic: { [TOPIC_ID]: 40 }, bySubtopic: {} },
          unseen: UNSEEN,
        },
      },
    } satisfies QuizSetupPreload
    // Stands in for useFilteredCountSync: re-run the selection whenever refetch changes.
    const { result, rerender } = renderHook(
      ({ p }) => {
        const fc = useFilteredCount(p)
        const { refetch } = fc
        useEffect(() => {
          refetch(SUBJECT_ID, TOPIC_IDS, SUBTOPIC_IDS, ALL, 'all', 'all', 'multiple_choice')
        }, [refetch])
        return fc
      },
      { initialProps: { p: Promise.resolve(SETUP) } },
    )
    await act(async () => undefined)
    expect(result.current.filteredCount).toBe(31)

    rerender({ p: Promise.resolve(REFRESHED) })
    await act(async () => undefined)

    expect(result.current.filteredCount).toBe(40)
    expect(mockGetFilteredCount).not.toHaveBeenCalled()
  })
})
