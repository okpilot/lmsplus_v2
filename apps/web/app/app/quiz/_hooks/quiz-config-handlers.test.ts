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
  let setCalcMode: ReturnType<typeof vi.fn<(m: 'all' | 'only' | 'exclude') => void>>
  let fc: FilteredCountState
  let topicTree: UseTopicTreeReturn

  const SUBJECT_ID = 'subj-1'
  const ALL_TOPIC_IDS = ['t1', 't2']
  const ALL_SUBTOPIC_IDS = ['s1', 's2']

  function makeDeps(overrides: Partial<Parameters<typeof createConfigHandlers>[0]> = {}) {
    return {
      setSubjectId,
      setFilters,
      setCount,
      setCalcMode,
      fc,
      topicTree,
      subjectId: SUBJECT_ID,
      allTopicIds: ALL_TOPIC_IDS,
      allSubtopicIds: ALL_SUBTOPIC_IDS,
      filters: ['all'] as ('all' | 'unseen' | 'incorrect' | 'flagged')[],
      calcMode: 'all' as 'all' | 'only' | 'exclude',
      ...overrides,
    }
  }

  beforeEach(() => {
    setSubjectId = vi.fn()
    setFilters = vi.fn()
    setCount = vi.fn()
    setCalcMode = vi.fn()
    fc = makeFilteredCount()
    topicTree = makeTopicTree()
  })

  describe('handleSubjectChange', () => {
    it('updates the subject id', () => {
      const { handleSubjectChange } = createConfigHandlers(makeDeps())
      handleSubjectChange('subj-1')
      expect(setSubjectId).toHaveBeenCalledWith('subj-1')
    })

    it('resets filters to all', () => {
      const { handleSubjectChange } = createConfigHandlers(makeDeps())
      handleSubjectChange('subj-1')
      expect(setFilters).toHaveBeenCalledWith(['all'])
    })

    it('resets question count to 10', () => {
      const { handleSubjectChange } = createConfigHandlers(makeDeps())
      handleSubjectChange('subj-1')
      expect(setCount).toHaveBeenCalledWith(10)
    })

    it('resets calcMode to all', () => {
      const { handleSubjectChange } = createConfigHandlers(makeDeps())
      handleSubjectChange('subj-1')
      expect(setCalcMode).toHaveBeenCalledWith('all')
    })

    it('resets the filtered count state', () => {
      const { handleSubjectChange } = createConfigHandlers(makeDeps())
      handleSubjectChange('subj-1')
      expect(fc.reset).toHaveBeenCalled()
    })

    it('loads topics when a non-empty subject id is given', () => {
      const { handleSubjectChange } = createConfigHandlers(makeDeps())
      handleSubjectChange('subj-1')
      expect(topicTree.loadTopics).toHaveBeenCalledWith('subj-1')
      expect(topicTree.reset).not.toHaveBeenCalled()
    })

    it('resets the topic tree when subject id is empty', () => {
      const { handleSubjectChange } = createConfigHandlers(makeDeps())
      handleSubjectChange('')
      expect(topicTree.reset).toHaveBeenCalled()
      expect(topicTree.loadTopics).not.toHaveBeenCalled()
    })
  })

  describe('handleFiltersChange', () => {
    it('updates filters to the new value', () => {
      const { handleFiltersChange } = createConfigHandlers(makeDeps())
      handleFiltersChange(['unseen'])
      expect(setFilters).toHaveBeenCalledWith(['unseen'])
    })

    it('resets filtered count when all filters are cleared back to all', () => {
      const { handleFiltersChange } = createConfigHandlers(makeDeps())
      // ['all'] means no active filter — fc.reset should be called
      handleFiltersChange(['all'])
      expect(fc.reset).toHaveBeenCalled()
    })

    it('does not reset filtered count when a real filter is active', () => {
      const { handleFiltersChange } = createConfigHandlers(makeDeps())
      handleFiltersChange(['unseen'])
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('does not reset filtered count when multiple filters include a non-all value', () => {
      const { handleFiltersChange } = createConfigHandlers(makeDeps())
      handleFiltersChange(['unseen', 'incorrect'])
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('resets filtered count when only the all filter is present in a multi-value array', () => {
      const { handleFiltersChange } = createConfigHandlers(makeDeps())
      // All entries are 'all' — no real filter
      handleFiltersChange(['all'])
      expect(fc.reset).toHaveBeenCalled()
    })

    it('does not reset filtered count when switch-filters clear but calc-mode still restricts', () => {
      const { handleFiltersChange } = createConfigHandlers(makeDeps({ calcMode: 'only' }))
      // Clearing to ['all'] while calcMode='only' must keep the badge (the filters
      // effect refetches) — resetting here would flash the unfiltered count.
      handleFiltersChange(['all'])
      expect(fc.reset).not.toHaveBeenCalled()
    })
  })

  describe('handleCalcModeChange', () => {
    it('updates calcMode to the new value', () => {
      const { handleCalcModeChange } = createConfigHandlers(makeDeps())
      handleCalcModeChange('only')
      expect(setCalcMode).toHaveBeenCalledWith('only')
    })

    it('refetches counts with the new calcMode when calc is active', () => {
      const { handleCalcModeChange } = createConfigHandlers(makeDeps())
      handleCalcModeChange('exclude')
      expect(fc.refetch).toHaveBeenCalledWith(
        SUBJECT_ID,
        ALL_TOPIC_IDS,
        ALL_SUBTOPIC_IDS,
        ['all'],
        'exclude',
      )
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('refetches (not resets) when a switch-filter is active and calc returns to all', () => {
      const { handleCalcModeChange } = createConfigHandlers(makeDeps({ filters: ['unseen'] }))
      handleCalcModeChange('all')
      expect(fc.refetch).toHaveBeenCalledWith(
        SUBJECT_ID,
        ALL_TOPIC_IDS,
        ALL_SUBTOPIC_IDS,
        ['unseen'],
        'all',
      )
    })

    it('resets counts when calc returns to all and no switch-filter is active', () => {
      const { handleCalcModeChange } = createConfigHandlers(makeDeps({ filters: ['all'] }))
      handleCalcModeChange('all')
      expect(fc.reset).toHaveBeenCalled()
      expect(fc.refetch).not.toHaveBeenCalled()
    })
  })
})
