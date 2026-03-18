import { useRef, useState, useTransition } from 'react'
import type { SubjectOption } from '@/lib/queries/quiz'
import { getFilteredCount } from '../actions/lookup'
import type { QuestionFilterValue, QuizMode } from '../types'
import { useQuizStart } from './use-quiz-start'
import { useTopicTree } from './use-topic-tree'

export function useQuizConfig({ subjects }: { subjects: SubjectOption[] }) {
  const [subjectId, setSubjectId] = useState('')
  const [mode, setMode] = useState<QuizMode>('study')
  const [filters, setFilters] = useState<QuestionFilterValue[]>(['all'])
  const [count, setCount] = useState(10)
  const [filteredCount, setFilteredCount] = useState<number | null>(null)
  const [, startFilterTransition] = useTransition()
  const filterGeneration = useRef(0)
  const topicTree = useTopicTree()

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

  function refetchFilteredCount(newFilters?: QuestionFilterValue[]) {
    setFilteredCount(null)
    if (!subjectId) return
    const activeFilters = (newFilters ?? filters).filter((f) => f !== 'all')
    if (!activeFilters.length) return
    filterGeneration.current++
    const gen = filterGeneration.current
    startFilterTransition(async () => {
      const result = await getFilteredCount({
        subjectId,
        topicIds: topicTree.getSelectedTopicIds(),
        subtopicIds: topicTree.getSelectedSubtopicIds(),
        filters: activeFilters,
      })
      if (gen === filterGeneration.current) setFilteredCount(result.count)
    })
  }

  function handleSubjectChange(id: string) {
    setSubjectId(id)
    setFilteredCount(null)
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
    loading,
    error,
    isPending: topicTree.isPending,
    handleSubjectChange,
    handleStart,
  }
}
