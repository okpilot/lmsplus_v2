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

  const {
    filteredCount,
    filteredByTopic,
    filteredBySubtopic,
    hasActiveFilters,
    refetchFilteredCount,
  } = useFilteredCount({ subjectId, filters, topicTree })

  const availableCount =
    filters.some((f) => f !== 'all') && filteredCount !== null
      ? filteredCount
      : topicTree.selectedQuestionCount

  const { loading, error, handleStart } = useQuizStart({
    subjectId,
    subjects,
    count,
    maxQuestions: availableCount,
    filters,
    topicTree,
  })

  function handleSubjectChange(id: string) {
    setSubjectId(id)
    setFilters(['all'])
    setCount(10)
    refetchFilteredCount(['all'])
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
    filteredByTopic: hasActiveFilters ? filteredByTopic : null,
    filteredBySubtopic: hasActiveFilters ? filteredBySubtopic : null,
    loading,
    error,
    isPending: topicTree.isPending,
    handleSubjectChange,
    handleStart,
  }
}
