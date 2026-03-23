import { useEffect, useMemo, useState } from 'react'
import type { SubjectOption } from '@/lib/queries/quiz'
import type { QuestionFilterValue, QuizMode } from '../types'
import { createConfigHandlers } from './quiz-config-handlers'
import { calcFilteredAvailable } from './topic-tree-helpers'
import { useFilteredCount } from './use-filtered-count'
import { useQuizStart } from './use-quiz-start'
import { useTopicTree } from './use-topic-tree'

export function useQuizConfig({ subjects }: { subjects: SubjectOption[] }) {
  const [subjectId, setSubjectId] = useState('')
  const [mode, setMode] = useState<QuizMode>('study')
  const [filters, setFilters] = useState<QuestionFilterValue[]>(['all'])
  const [count, setCount] = useState(10)
  const topicTree = useTopicTree()
  const fc = useFilteredCount()
  const hasActiveFilters = filters.some((f) => f !== 'all')
  const allTopicIds = useMemo(() => topicTree.topics.map((t) => t.id), [topicTree.topics])
  const allSubtopicIds = useMemo(
    () => topicTree.topics.flatMap((t) => t.subtopics.map((st) => st.id)),
    [topicTree.topics],
  )

  const availableCount = useMemo(() => {
    if (!hasActiveFilters || !fc.filteredByTopic || !fc.filteredBySubtopic) {
      return topicTree.selectedQuestionCount
    }
    return calcFilteredAvailable(
      topicTree.topics,
      topicTree.checkedTopics,
      topicTree.checkedSubtopics,
      fc.filteredByTopic,
      fc.filteredBySubtopic,
    )
  }, [
    hasActiveFilters,
    fc.filteredByTopic,
    fc.filteredBySubtopic,
    topicTree.selectedQuestionCount,
    topicTree.topics,
    topicTree.checkedTopics,
    topicTree.checkedSubtopics,
  ])
  const { loading, error, handleStart } = useQuizStart({
    subjectId,
    subjects,
    count,
    maxQuestions: availableCount,
    filters,
    topicTree,
  })

  useEffect(() => {
    if (!subjectId || !hasActiveFilters || allTopicIds.length === 0) return
    fc.refetch(subjectId, allTopicIds, allSubtopicIds, filters)
  }, [subjectId, hasActiveFilters, filters, allTopicIds, allSubtopicIds, fc.refetch])
  const { handleSubjectChange, handleFiltersChange } = createConfigHandlers({
    setSubjectId,
    setFilters,
    setCount,
    fc,
    topicTree,
  })

  return {
    subjectId,
    mode,
    setMode,
    filters,
    setFilters: handleFiltersChange,
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
