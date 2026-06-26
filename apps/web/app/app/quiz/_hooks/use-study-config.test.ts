import { act, renderHook } from '@testing-library/react'
import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------
// useQuizConfigState is NOT mocked — it owns the selection state and its
// real behaviour (handleSubjectChange calling topicTree.loadTopics, etc.) is
// what we want to verify through the useStudyConfig facade.

const { mockLoadTopics } = vi.hoisted(() => ({
  mockLoadTopics: vi.fn(),
}))

vi.mock('./use-topic-tree', () => ({ useTopicTree: vi.fn() }))
vi.mock('./use-filtered-count', () => ({ useFilteredCount: vi.fn() }))
vi.mock('./use-filtered-count-sync', () => ({ useFilteredCountSync: vi.fn() }))
vi.mock('./use-available-count', () => ({ useAvailableCount: vi.fn() }))

// ---- Subject under test ---------------------------------------------------

import { useAvailableCount } from './use-available-count'
import { useFilteredCount } from './use-filtered-count'
import { useStudyConfig } from './use-study-config'
import { useTopicTree } from './use-topic-tree'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'

function buildMockTopicTree(overrides?: Record<string, unknown>) {
  return {
    topics: [],
    checkedTopics: new Set<string>(),
    checkedSubtopics: new Set<string>(),
    allSelected: false,
    isPending: false,
    totalQuestions: 0,
    selectedQuestionCount: 0,
    loadTopics: mockLoadTopics,
    toggleTopic: vi.fn(),
    toggleSubtopic: vi.fn(),
    selectAll: vi.fn(),
    reset: vi.fn(),
    getSelectedTopicIds: vi.fn(() => [] as string[]),
    getSelectedSubtopicIds: vi.fn(() => [] as string[]),
    ...overrides,
  }
}

function buildMockFilteredCount(overrides?: Record<string, unknown>) {
  return {
    filteredCount: null,
    filteredByTopic: null,
    filteredBySubtopic: null,
    isFilterPending: false,
    authError: false,
    refetch: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree())
  ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount())
  ;(useAvailableCount as Mock).mockReturnValue(0)
})

// ---- Initial state -------------------------------------------------------

describe('useStudyConfig — initial state', () => {
  it('exposes an empty subjectId and default filter values on first render', () => {
    const { result } = renderHook(() => useStudyConfig())
    expect(result.current.subjectId).toBe('')
    expect(result.current.filters).toEqual(['all'])
    expect(result.current.calcMode).toBe('all')
    expect(result.current.imageMode).toBe('all')
    expect(result.current.count).toBe(10)
  })

  it('reports not pending when both the topic tree and filtered count are idle', () => {
    const { result } = renderHook(() => useStudyConfig())
    expect(result.current.isPending).toBe(false)
  })

  it('reports pending when the topic tree is loading', () => {
    ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree({ isPending: true }))
    const { result } = renderHook(() => useStudyConfig())
    expect(result.current.isPending).toBe(true)
  })

  it('reports pending when the filtered count is loading', () => {
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ isFilterPending: true }))
    const { result } = renderHook(() => useStudyConfig())
    expect(result.current.isPending).toBe(true)
  })

  it('exposes the availableCount value from useAvailableCount', () => {
    ;(useAvailableCount as Mock).mockReturnValue(42)
    const { result } = renderHook(() => useStudyConfig())
    expect(result.current.availableCount).toBe(42)
  })

  it('exposes the topicTree from useTopicTree', () => {
    const mockTree = buildMockTopicTree({ selectedQuestionCount: 99 })
    ;(useTopicTree as Mock).mockReturnValue(mockTree)
    const { result } = renderHook(() => useStudyConfig())
    expect(result.current.topicTree).toBe(mockTree)
  })
})

// ---- handleSubjectChange -------------------------------------------------

describe('useStudyConfig — handleSubjectChange', () => {
  it('updates the subjectId when a new subject is selected', async () => {
    const { result } = renderHook(() => useStudyConfig())
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    expect(result.current.subjectId).toBe(SUBJECT_ID)
  })

  it('triggers topic tree loading when a subject is selected', async () => {
    const { result } = renderHook(() => useStudyConfig())
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    expect(mockLoadTopics).toHaveBeenCalledWith(SUBJECT_ID)
  })
})

// ---- filteredByTopic exposure --------------------------------------------

describe('useStudyConfig — filtered topic counts', () => {
  it('exposes filteredByTopic as null when no active filters are set', () => {
    const filteredByTopic = new Map<string, number>([['t1', 5]])
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ filteredByTopic }))
    const { result } = renderHook(() => useStudyConfig())
    // No active filters → hasActiveFilters=false → filteredByTopic must be null.
    expect(result.current.filteredByTopic).toBeNull()
  })

  it('exposes filteredByTopic when at least one filter is active', async () => {
    const filteredByTopic = new Map<string, number>([['t1', 5]])
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ filteredByTopic }))
    const { result } = renderHook(() => useStudyConfig())
    // Activate a filter so hasActiveFilters becomes true.
    await act(async () => {
      result.current.setFilters(['unseen'])
    })
    expect(result.current.filteredByTopic).toBe(filteredByTopic)
  })
})

// ---- authError propagation -----------------------------------------------

describe('useStudyConfig — authError propagation', () => {
  it('surfaces the authError flag from useFilteredCount', () => {
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ authError: true }))
    const { result } = renderHook(() => useStudyConfig())
    expect(result.current.authError).toBe(true)
  })
})
