import { useState } from 'react'
import type { SubjectOption } from '@/lib/queries/quiz'
import type { QuestionFilterValue, QuizMode } from '../types'
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

  const availableCount =
    hasActiveFilters && fc.filteredCount !== null
      ? fc.filteredCount
      : topicTree.selectedQuestionCount

  const { loading, error, handleStart } = useQuizStart({
    subjectId,
    subjects,
    count,
    maxQuestions: availableCount,
    filters,
    topicTree,
  })

  function refetchFilteredCount(newFilters?: QuestionFilterValue[]) {
    fc.refetch(
      subjectId,
      topicTree.getSelectedTopicIds(),
      topicTree.getSelectedSubtopicIds(),
      newFilters ?? filters,
    )
  }

  function handleSubjectChange(id: string) {
    setSubjectId(id)
    fc.reset()
    setFilters(['all'])
    setCount(10)
    if (id) topicTree.loadTopics(id)
    else topicTree.reset()
  }

  function handleFiltersChange(newFilters: QuestionFilterValue[]) {
    setFilters(newFilters)
    refetchFilteredCount(newFilters)
  }

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
