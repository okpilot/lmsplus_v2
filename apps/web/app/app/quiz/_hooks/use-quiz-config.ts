import type { SubjectOption } from '@/lib/queries/quiz'
import { useRef, useState, useTransition } from 'react'
import type { QuestionFilter } from '../_components/question-filters'
import { getFilteredCount } from '../actions/lookup'
import { useQuizCascade } from './use-quiz-cascade'
import { useQuizStart } from './use-quiz-start'

export function useQuizConfig({ subjects }: { subjects: SubjectOption[] }) {
  const cascade = useQuizCascade()
  const [filter, setFilter] = useState<QuestionFilter>('all')
  const [count, setCount] = useState(10)
  const [filteredCount, setFilteredCount] = useState<number | null>(null)
  const [, startFilterTransition] = useTransition()
  const filterGeneration = useRef(0)

  const { subjectId, topicId, subtopicId, topics, subtopics } = cascade

  const staticCount = subtopicId
    ? (subtopics.find((st) => st.id === subtopicId)?.questionCount ?? 0)
    : topicId
      ? (topics.find((t) => t.id === topicId)?.questionCount ?? 0)
      : (subjects.find((s) => s.id === subjectId)?.questionCount ?? 0)

  const availableCount = filteredCount ?? staticCount
  const maxQuestions = Math.min(availableCount, 50)

  const { loading, error, handleStart } = useQuizStart({
    subjectId,
    topicId,
    subtopicId,
    subjects,
    count,
    maxQuestions,
    filter,
  })

  function handleFilterChange(newFilter: QuestionFilter) {
    setFilter(newFilter)
    if (!subjectId) return
    setFilteredCount(null)
    filterGeneration.current++
    const gen = filterGeneration.current
    startFilterTransition(async () => {
      const result = await getFilteredCount({
        subjectId,
        topicId: topicId || undefined,
        subtopicId: subtopicId || undefined,
        filter: newFilter,
      })
      if (gen === filterGeneration.current) {
        setFilteredCount(result.count)
      }
    })
  }
  return {
    ...cascade,
    handleSubjectChange: (id: string) => {
      setFilteredCount(null)
      cascade.handleSubjectChange(id)
    },
    handleTopicChange: (id: string) => {
      setFilteredCount(null)
      cascade.handleTopicChange(id)
    },
    setSubtopicId: (id: string) => {
      setFilteredCount(null)
      cascade.setSubtopicId(id)
    },
    filter,
    setFilter: handleFilterChange,
    count,
    setCount,
    loading,
    error,
    maxQuestions,
    filteredCount,
    handleStart,
  }
}
