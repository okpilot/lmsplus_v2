import { useEffect, useMemo } from 'react'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
import type { useFilteredCount } from './use-filtered-count'
import type { useTopicTree } from './use-topic-tree'

/**
 * Refetches the filtered-pool counts whenever the active filter selection
 * changes. Extracted from useQuizConfig so the orchestration hook stays small.
 */
export function useFilteredCountSync(opts: {
  subjectId: string
  hasActiveFilters: boolean
  filters: QuestionFilterValue[]
  calcMode: CalcMode
  imageMode: ImageMode
  topicTree: ReturnType<typeof useTopicTree>
  fc: ReturnType<typeof useFilteredCount>
}) {
  const { subjectId, hasActiveFilters, filters, calcMode, imageMode, topicTree, fc } = opts
  const allTopicIds = useMemo(() => topicTree.topics.map((t) => t.id), [topicTree.topics])
  const allSubtopicIds = useMemo(
    () => topicTree.topics.flatMap((t) => t.subtopics.map((st) => st.id)),
    [topicTree.topics],
  )

  useEffect(() => {
    if (!subjectId || !hasActiveFilters || allTopicIds.length === 0) return
    fc.refetch(subjectId, allTopicIds, allSubtopicIds, filters, calcMode, imageMode)
  }, [
    subjectId,
    hasActiveFilters,
    filters,
    calcMode,
    imageMode,
    allTopicIds,
    allSubtopicIds,
    fc.refetch,
  ])
}
