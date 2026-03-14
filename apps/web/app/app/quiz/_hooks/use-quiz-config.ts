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

  function refetchFilteredCount(f: QuestionFilter, sId: string, tId?: string, stId?: string) {
    setFilteredCount(null)
    if (!sId || f === 'all') return
    filterGeneration.current++
    const gen = filterGeneration.current
    startFilterTransition(async () => {
      const result = await getFilteredCount({
        subjectId: sId,
        topicId: tId,
        subtopicId: stId,
        filter: f,
      })
      if (gen === filterGeneration.current) setFilteredCount(result.count)
    })
  }

  return {
    ...cascade,
    handleSubjectChange: (id: string) => {
      cascade.handleSubjectChange(id)
      refetchFilteredCount(filter, id)
    },
    handleTopicChange: (id: string) => {
      cascade.handleTopicChange(id)
      refetchFilteredCount(filter, subjectId, id || undefined, undefined)
    },
    setSubtopicId: (id: string) => {
      cascade.setSubtopicId(id)
      refetchFilteredCount(filter, subjectId, topicId || undefined, id || undefined)
    },
    filter,
    setFilter: (newFilter: QuestionFilter) => {
      setFilter(newFilter)
      refetchFilteredCount(newFilter, subjectId, topicId || undefined, subtopicId || undefined)
    },
    count,
    setCount,
    loading,
    error,
    maxQuestions,
    filteredCount,
    handleStart,
  }
}
