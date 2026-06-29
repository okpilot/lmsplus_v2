import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseTopicTreeReturn } from './topic-tree-helpers'
import * as helpers from './topic-tree-helpers'
import { useAvailableCount } from './use-available-count'

vi.mock('./topic-tree-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./topic-tree-helpers')>()
  return { ...actual, computeAvailableCount: vi.fn() }
})

function makeTopicTree(overrides: Partial<UseTopicTreeReturn> = {}): UseTopicTreeReturn {
  return {
    topics: [],
    checkedTopics: new Set(),
    checkedSubtopics: new Set(),
    allSelected: false,
    isPending: false,
    totalQuestions: 0,
    selectedQuestionCount: 0,
    loadTopics: vi.fn(),
    toggleTopic: vi.fn(),
    toggleSubtopic: vi.fn(),
    selectAll: vi.fn(),
    reset: vi.fn(),
    getSelectedTopicIds: vi.fn(() => []),
    getSelectedSubtopicIds: vi.fn(() => []),
    ...overrides,
  }
}

describe('useAvailableCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns computeAvailableCount over the topic-tree fields and current filter maps', () => {
    vi.mocked(helpers.computeAvailableCount).mockReturnValue(42)
    const topicTree = makeTopicTree({ selectedQuestionCount: 7 })
    const { result } = renderHook(() =>
      useAvailableCount({
        hasActiveFilters: true,
        filteredByTopic: { t1: 3 },
        filteredBySubtopic: { s1: 1 },
        topicTree,
      }),
    )
    expect(result.current).toBe(42)
    expect(helpers.computeAvailableCount).toHaveBeenCalledWith({
      hasActiveFilters: true,
      filteredByTopic: { t1: 3 },
      filteredBySubtopic: { s1: 1 },
      selectedQuestionCount: 7,
      topics: topicTree.topics,
      checkedTopics: topicTree.checkedTopics,
      checkedSubtopics: topicTree.checkedSubtopics,
    })
  })

  it('uses the MC-only filtered count for Discovery with no active filters', () => {
    vi.mocked(helpers.computeAvailableCount).mockReturnValue(8)
    const topicTree = makeTopicTree({ selectedQuestionCount: 20 })
    const { result } = renderHook(() =>
      useAvailableCount({
        hasActiveFilters: false,
        preferFiltered: true,
        filteredByTopic: { t1: 8 },
        filteredBySubtopic: {},
        topicTree,
      }),
    )
    expect(result.current).toBe(8)
    expect(helpers.computeAvailableCount).toHaveBeenCalledWith(
      expect.objectContaining({ hasActiveFilters: false, preferFiltered: true }),
    )
  })

  it('memoizes — does not recompute when inputs are unchanged across rerenders', () => {
    vi.mocked(helpers.computeAvailableCount).mockReturnValue(5)
    const opts = {
      hasActiveFilters: false,
      filteredByTopic: null,
      filteredBySubtopic: null,
      topicTree: makeTopicTree(),
    }
    const { result, rerender } = renderHook((p) => useAvailableCount(p), { initialProps: opts })
    rerender(opts)
    expect(result.current).toBe(5)
    expect(helpers.computeAvailableCount).toHaveBeenCalledTimes(1)
  })
})
