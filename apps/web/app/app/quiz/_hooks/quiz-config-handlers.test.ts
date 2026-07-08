import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionType } from '@/app/app/_types/session'
import type { FilteredCountState } from '../session-types'
import { createConfigHandlers } from './quiz-config-handlers'
import type { UseTopicTreeReturn } from './topic-tree-helpers'

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
  let setImageMode: ReturnType<typeof vi.fn<(m: 'all' | 'only' | 'exclude') => void>>
  let setQuestionType: ReturnType<typeof vi.fn<(t: QuestionType | undefined) => void>>
  let fc: FilteredCountState
  let topicTree: UseTopicTreeReturn

  function makeDeps(overrides: Partial<Parameters<typeof createConfigHandlers>[0]> = {}) {
    return {
      setSubjectId,
      setFilters,
      setCount,
      setCalcMode,
      setImageMode,
      setQuestionType,
      fc,
      topicTree,
      filters: ['all'] as ('all' | 'unseen' | 'incorrect' | 'flagged')[],
      calcMode: 'all' as 'all' | 'only' | 'exclude',
      imageMode: 'all' as 'all' | 'only' | 'exclude',
      questionType: undefined,
      ...overrides,
    }
  }

  beforeEach(() => {
    setSubjectId = vi.fn()
    setFilters = vi.fn()
    setCount = vi.fn()
    setCalcMode = vi.fn()
    setImageMode = vi.fn()
    setQuestionType = vi.fn()
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

    it('resets imageMode to all', () => {
      const { handleSubjectChange } = createConfigHandlers(makeDeps())
      handleSubjectChange('subj-1')
      expect(setImageMode).toHaveBeenCalledWith('all')
    })

    it('resets questionType to undefined', () => {
      const { handleSubjectChange } = createConfigHandlers(makeDeps({ questionType: 'ordering' }))
      handleSubjectChange('subj-1')
      expect(setQuestionType).toHaveBeenCalledWith(undefined)
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

    it('does not reset filtered count when switch-filters clear but image-mode still restricts', () => {
      const { handleFiltersChange } = createConfigHandlers(makeDeps({ imageMode: 'only' }))
      // Clearing to ['all'] while imageMode='only' must keep the badge.
      handleFiltersChange(['all'])
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('does not reset filtered count when switch-filters clear but questionType still restricts', () => {
      const { handleFiltersChange } = createConfigHandlers(makeDeps({ questionType: 'ordering' }))
      // Clearing to ['all'] while questionType='ordering' must keep the badge.
      handleFiltersChange(['all'])
      expect(fc.reset).not.toHaveBeenCalled()
    })
  })

  describe('handleCalcModeChange', () => {
    // The handler only updates state + conditionally resets; the counts effect (calcMode
    // is in its dep array, guarded on topics being loaded) performs the refetch. So the
    // handler never calls fc.refetch directly — that avoids a double fetch and the
    // empty-topics-before-load race.
    it('updates calcMode to the new value', () => {
      const { handleCalcModeChange } = createConfigHandlers(makeDeps())
      handleCalcModeChange('only')
      expect(setCalcMode).toHaveBeenCalledWith('only')
    })

    it('does not reset (or directly refetch) when calc becomes active', () => {
      const { handleCalcModeChange } = createConfigHandlers(makeDeps())
      handleCalcModeChange('exclude')
      expect(fc.reset).not.toHaveBeenCalled()
      expect(fc.refetch).not.toHaveBeenCalled()
    })

    it('does not reset when a switch-filter is active and calc returns to all', () => {
      const { handleCalcModeChange } = createConfigHandlers(makeDeps({ filters: ['unseen'] }))
      handleCalcModeChange('all')
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('resets counts when calc returns to all and no switch-filter is active', () => {
      const { handleCalcModeChange } = createConfigHandlers(
        makeDeps({ filters: ['all'], calcMode: 'only' }),
      )
      handleCalcModeChange('all')
      expect(fc.reset).toHaveBeenCalled()
      expect(fc.refetch).not.toHaveBeenCalled()
    })

    it('does not reset when imageMode is active and calc returns to all', () => {
      const { handleCalcModeChange } = createConfigHandlers(
        makeDeps({ filters: ['all'], calcMode: 'only', imageMode: 'exclude' }),
      )
      handleCalcModeChange('all')
      // imageMode='exclude' still restricts the pool — must NOT flash unfiltered count.
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('does not reset when questionType is active and calc returns to all', () => {
      const { handleCalcModeChange } = createConfigHandlers(
        makeDeps({ filters: ['all'], calcMode: 'only', questionType: 'ordering' }),
      )
      handleCalcModeChange('all')
      // questionType='ordering' still restricts the pool — must NOT flash unfiltered count.
      expect(fc.reset).not.toHaveBeenCalled()
    })
  })

  describe('handleImageModeChange', () => {
    // The handler only updates state + conditionally resets; the counts effect (imageMode
    // is in its dep array) performs the refetch. No direct refetch here — same rationale
    // as handleCalcModeChange (avoids double fetch and empty-topics-before-load race).
    it('updates imageMode to the new value', () => {
      const { handleImageModeChange } = createConfigHandlers(makeDeps())
      handleImageModeChange('only')
      expect(setImageMode).toHaveBeenCalledWith('only')
    })

    it('does not reset (or directly refetch) when image mode becomes active', () => {
      const { handleImageModeChange } = createConfigHandlers(makeDeps())
      handleImageModeChange('exclude')
      expect(fc.reset).not.toHaveBeenCalled()
      expect(fc.refetch).not.toHaveBeenCalled()
    })

    it('does not reset when a switch-filter is active and image mode returns to all', () => {
      const { handleImageModeChange } = createConfigHandlers(makeDeps({ filters: ['unseen'] }))
      handleImageModeChange('all')
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('resets counts when image mode returns to all and no other filter is active', () => {
      const { handleImageModeChange } = createConfigHandlers(
        makeDeps({ filters: ['all'], calcMode: 'all', imageMode: 'only' }),
      )
      handleImageModeChange('all')
      expect(fc.reset).toHaveBeenCalled()
      expect(fc.refetch).not.toHaveBeenCalled()
    })

    it('does not reset when calcMode is active and image mode returns to all', () => {
      const { handleImageModeChange } = createConfigHandlers(
        makeDeps({ filters: ['all'], calcMode: 'only', imageMode: 'exclude' }),
      )
      handleImageModeChange('all')
      // calcMode='only' still restricts the pool — must NOT flash unfiltered count.
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('does not reset when questionType is active and image mode returns to all', () => {
      const { handleImageModeChange } = createConfigHandlers(
        makeDeps({ filters: ['all'], imageMode: 'only', questionType: 'ordering' }),
      )
      handleImageModeChange('all')
      // questionType='ordering' still restricts the pool — must NOT flash unfiltered count.
      expect(fc.reset).not.toHaveBeenCalled()
    })
  })

  describe('handleQuestionTypeChange', () => {
    // The handler only updates state + conditionally resets; the counts effect
    // (questionType is in its dep array) performs the refetch. Mirrors
    // handleCalcModeChange/handleImageModeChange.
    it('updates questionType to the new value', () => {
      const { handleQuestionTypeChange } = createConfigHandlers(makeDeps())
      handleQuestionTypeChange('ordering')
      expect(setQuestionType).toHaveBeenCalledWith('ordering')
    })

    it('does not reset (or directly refetch) when a type becomes active', () => {
      const { handleQuestionTypeChange } = createConfigHandlers(makeDeps())
      handleQuestionTypeChange('short_answer')
      expect(fc.reset).not.toHaveBeenCalled()
      expect(fc.refetch).not.toHaveBeenCalled()
    })

    it('does not reset when a switch-filter is active and type returns to undefined', () => {
      const { handleQuestionTypeChange } = createConfigHandlers(
        makeDeps({ filters: ['unseen'], questionType: 'ordering' }),
      )
      handleQuestionTypeChange(undefined)
      expect(fc.reset).not.toHaveBeenCalled()
    })

    it('resets counts when type returns to undefined and no other filter is active', () => {
      const { handleQuestionTypeChange } = createConfigHandlers(
        makeDeps({ filters: ['all'], questionType: 'ordering' }),
      )
      handleQuestionTypeChange(undefined)
      expect(fc.reset).toHaveBeenCalled()
      expect(fc.refetch).not.toHaveBeenCalled()
    })

    it('does not reset when calcMode is active and type returns to undefined', () => {
      const { handleQuestionTypeChange } = createConfigHandlers(
        makeDeps({ filters: ['all'], calcMode: 'only', questionType: 'ordering' }),
      )
      handleQuestionTypeChange(undefined)
      // calcMode='only' still restricts the pool — must NOT flash unfiltered count.
      expect(fc.reset).not.toHaveBeenCalled()
    })
  })
})
