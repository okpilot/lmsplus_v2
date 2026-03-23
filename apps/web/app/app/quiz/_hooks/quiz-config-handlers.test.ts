import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createConfigHandlers } from './quiz-config-handlers'
import type { UseTopicTreeReturn } from './topic-tree-helpers'
import type { FilteredCountState } from './use-filtered-count'

function makeFilteredCount(overrides: Partial<FilteredCountState> = {}): FilteredCountState {
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

describe('createConfigHandlers', () => {
  let setSubjectId: ReturnType<typeof vi.fn<(id: string) => void>>
  let setFilters: ReturnType<typeof vi.fn<(f: string[]) => void>>
  let setCount: ReturnType<typeof vi.fn<(n: number) => void>>
  let fc: FilteredCountState
  let topicTree: UseTopicTreeReturn

  beforeEach(() => {
    setSubjectId = vi.fn()
    setFilters = vi.fn()
    setCount = vi.fn()
    fc = makeFilteredCount()
    topicTree = makeTopicTree()
  })

  describe('handleSubjectChange', () => {
    it('updates the subject id', () => {
      const { handleSubjectChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      handleSubjectChange('subj-1')
      expect(setSubjectId).toHaveBeenCalledWith('subj-1')
    })

    it('resets filters to all', () => {
      const { handleSubjectChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      handleSubjectChange('subj-1')
      expect(setFilters).toHaveBeenCalledWith(['all'])
    })

    it('resets question count to 10', () => {
      const { handleSubjectChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      handleSubjectChange('subj-1')
      expect(setCount).toHaveBeenCalledWith(10)
    })

    it('resets the filtered count state', () => {
      const { handleSubjectChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      handleSubjectChange('subj-1')
      expect(fc.reset).toHaveBeenCalled()
    })

    it('loads topics when a non-empty subject id is given', () => {
      const { handleSubjectChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      handleSubjectChange('subj-1')
      expect(topicTree.loadTopics).toHaveBeenCalledWith('subj-1')
      expect(topicTree.reset).not.toHaveBeenCalled()
    })

    it('resets the topic tree when subject id is empty', () => {
      const { handleSubjectChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      handleSubjectChange('')
      expect(topicTree.reset).toHaveBeenCalled()
      expect(topicTree.loadTopics).not.toHaveBeenCalled()
    })
  })

  describe('handleFiltersChange', () => {
    it('updates filters to the new value', () => {
      const { handleFiltersChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      handleFiltersChange(['unseen'])
      expect(setFilters).toHaveBeenCalledWith(['unseen'])
    })

    it('resets filtered count when all filters are cleared back to all', () => {
      const { handleFiltersChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      // ['all'] means no active filter — fc.reset should be called
      handleFiltersChange(['all'])
      expect(fc.reset).toHaveBeenCalled()
    })

    it('does not reset filtered count when a real filter is active', () => {
      const { handleFiltersChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      handleFiltersChange(['unseen'])
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('does not reset filtered count when multiple filters include a non-all value', () => {
      const { handleFiltersChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      handleFiltersChange(['unseen', 'incorrect'])
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('resets filtered count when only the all filter is present in a multi-value array', () => {
      const { handleFiltersChange } = createConfigHandlers({
        setSubjectId,
        setFilters,
        setCount,
        fc,
        topicTree,
      })
      // All entries are 'all' — no real filter
      handleFiltersChange(['all'])
      expect(fc.reset).toHaveBeenCalled()
    })
  })
})
