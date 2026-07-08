import { useEffect, useMemo } from 'react'
import type { QuestionType } from '@/app/app/_types/session'
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
  // Study/Discovery passes 'multiple_choice' so the count matches the MC-only
  // fetch; the RT setup's single-select type filter (Slice 3) can pass any of
  // the 5 types; the quiz/exam paths omit it (type-agnostic count) (#1008).
  questionType?: QuestionType
}) {
  const { subjectId, hasActiveFilters, filters, calcMode, imageMode, topicTree, fc, questionType } =
    opts
  const allTopicIds = useMemo(() => topicTree.topics.map((t) => t.id), [topicTree.topics])
  const allSubtopicIds = useMemo(
    () => topicTree.topics.flatMap((t) => t.subtopics.map((st) => st.id)),
    [topicTree.topics],
  )

  useEffect(() => {
    if (!subjectId || allTopicIds.length === 0) return
    // Study/Discovery (questionType set) always counts the MC-only pool, so it must
    // fire even with no other active filter; the type-agnostic quiz/exam path only
    // needs the count once a filter is active (#1008).
    if (!hasActiveFilters && questionType === undefined) return
    fc.refetch(subjectId, allTopicIds, allSubtopicIds, filters, calcMode, imageMode, questionType)
  }, [
    subjectId,
    hasActiveFilters,
    filters,
    calcMode,
    imageMode,
    questionType,
    allTopicIds,
    allSubtopicIds,
    fc.refetch,
  ])
}
