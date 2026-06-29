import { useMemo } from 'react'
import { computeAvailableCount, type UseTopicTreeReturn } from './topic-tree-helpers'

export function useAvailableCount(opts: {
  hasActiveFilters: boolean
  // Discovery passes true so availableCount derives from the MC-aware filtered counts
  // even with no active filter; quiz/exam omit it (topic-tree total fallback) (#1008).
  preferFiltered?: boolean
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
  topicTree: UseTopicTreeReturn
}): number {
  const { hasActiveFilters, preferFiltered, filteredByTopic, filteredBySubtopic, topicTree } = opts
  return useMemo(
    () =>
      computeAvailableCount({
        hasActiveFilters,
        preferFiltered,
        filteredByTopic,
        filteredBySubtopic,
        selectedQuestionCount: topicTree.selectedQuestionCount,
        topics: topicTree.topics,
        checkedTopics: topicTree.checkedTopics,
        checkedSubtopics: topicTree.checkedSubtopics,
      }),
    [
      hasActiveFilters,
      preferFiltered,
      filteredByTopic,
      filteredBySubtopic,
      topicTree.selectedQuestionCount,
      topicTree.topics,
      topicTree.checkedTopics,
      topicTree.checkedSubtopics,
    ],
  )
}
