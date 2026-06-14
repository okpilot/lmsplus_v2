import { useEffect, useMemo, useState } from 'react'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import type { CalcMode, ImageMode, QuestionFilterValue, QuizMode } from '../types'
import { createConfigHandlers } from './quiz-config-handlers'
import { useAvailableCount } from './use-available-count'
import { useFilteredCount } from './use-filtered-count'
import { useQuizStart } from './use-quiz-start'
import { useTopicTree } from './use-topic-tree'

export function useQuizConfig({ userId, subjects }: { userId: string; subjects: SubjectOption[] }) {
  const [subjectId, setSubjectId] = useState('')
  const [mode, setMode] = useState<QuizMode>('study')
  const [filters, setFilters] = useState<QuestionFilterValue[]>(['all'])
  const [calcMode, setCalcMode] = useState<CalcMode>('all')
  const [imageMode, setImageMode] = useState<ImageMode>('all')
  const [count, setCount] = useState(10)
  const topicTree = useTopicTree()
  const fc = useFilteredCount()
  const hasActiveFilters =
    filters.some((f) => f !== 'all') || calcMode !== 'all' || imageMode !== 'all'
  const allTopicIds = useMemo(() => topicTree.topics.map((t) => t.id), [topicTree.topics])
  const allSubtopicIds = useMemo(
    () => topicTree.topics.flatMap((t) => t.subtopics.map((st) => st.id)),
    [topicTree.topics],
  )
  const availableCount = useAvailableCount({
    hasActiveFilters,
    filteredByTopic: fc.filteredByTopic,
    filteredBySubtopic: fc.filteredBySubtopic,
    topicTree,
  })
  const { loading, error, handleStart } = useQuizStart({
    userId,
    subjectId,
    subjects,
    count,
    maxQuestions: availableCount,
    filters,
    calcMode,
    imageMode,
    topicTree,
  })

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
  const { handleSubjectChange, handleFiltersChange, handleCalcModeChange, handleImageModeChange } =
    createConfigHandlers({
      setSubjectId,
      setFilters,
      setCount,
      setCalcMode,
      setImageMode,
      fc,
      topicTree,
      filters,
      calcMode,
      imageMode,
    })

  return {
    subjectId,
    mode,
    setMode,
    filters,
    setFilters: handleFiltersChange,
    calcMode,
    setCalcMode: handleCalcModeChange,
    imageMode,
    setImageMode: handleImageModeChange,
    count,
    setCount,
    availableCount,
    topicTree,
    filteredByTopic: hasActiveFilters ? fc.filteredByTopic : null,
    filteredBySubtopic: hasActiveFilters ? fc.filteredBySubtopic : null,
    loading,
    error,
    authError: fc.authError,
    isPending: topicTree.isPending || fc.isFilterPending,
    handleSubjectChange,
    handleStart,
  }
}
