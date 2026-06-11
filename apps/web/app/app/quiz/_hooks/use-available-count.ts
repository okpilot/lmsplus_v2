import { useMemo } from 'react'
import { computeAvailableCount, type UseTopicTreeReturn } from './topic-tree-helpers'

export function useAvailableCount(opts: {
  hasActiveFilters: boolean
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
  topicTree: UseTopicTreeReturn
}): number {
  const { hasActiveFilters, filteredByTopic, filteredBySubtopic, topicTree } = opts
  return useMemo(
    () =>
      computeAvailableCount({
        hasActiveFilters,
        filteredByTopic,
        filteredBySubtopic,
        selectedQuestionCount: topicTree.selectedQuestionCount,
        topics: topicTree.topics,
        checkedTopics: topicTree.checkedTopics,
        checkedSubtopics: topicTree.checkedSubtopics,
      }),
    [
      hasActiveFilters,
      filteredByTopic,
      filteredBySubtopic,
      topicTree.selectedQuestionCount,
      topicTree.topics,
      topicTree.checkedTopics,
      topicTree.checkedSubtopics,
    ],
  )
}
