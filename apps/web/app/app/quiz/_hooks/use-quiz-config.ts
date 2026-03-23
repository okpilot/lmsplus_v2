import { useEffect, useMemo, useRef, useState } from 'react'
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

  // Derive all topic/subtopic IDs for the entire subject (for filter queries)
  const allTopicIds = useMemo(() => topicTree.topics.map((t) => t.id), [topicTree.topics])
  const allSubtopicIds = useMemo(
    () => topicTree.topics.flatMap((t) => t.subtopics.map((st) => st.id)),
    [topicTree.topics],
  )

  // Available count for the quiz start: intersection of checked topics + active filter
  const availableCount = useMemo(() => {
    if (!hasActiveFilters || fc.filteredByTopic === null || fc.filteredBySubtopic === null) {
      return topicTree.selectedQuestionCount
    }
    // Sum filtered counts for checked topics/subtopics only
    let total = 0
    for (const topic of topicTree.topics) {
      if (topic.subtopics.length === 0) {
        // Leaf topic (no subtopics) — count if topic is checked
        if (topicTree.checkedTopics.has(topic.id)) {
          total += fc.filteredByTopic[topic.id] ?? 0
        }
      } else {
        // Topic with subtopics — sum checked subtopics
        for (const st of topic.subtopics) {
          if (topicTree.checkedSubtopics.has(st.id)) {
            total += fc.filteredBySubtopic[st.id] ?? 0
          }
        }
      }
    }
    return total
  }, [hasActiveFilters, fc.filteredByTopic, fc.filteredBySubtopic, topicTree])

  const { loading, error, handleStart } = useQuizStart({
    subjectId,
    subjects,
    count,
    maxQuestions: availableCount,
    filters,
    topicTree,
  })

  // Skip the very first render (mount) to avoid a spurious refetch
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
  }, [])

  // Fetch filtered counts for the ENTIRE subject whenever filters change.
  // This is independent of topic checkbox selection — counts are informational.
  useEffect(() => {
    if (!mountedRef.current) return
    if (!subjectId || !hasActiveFilters) return
    if (allTopicIds.length === 0) return

    fc.refetch(subjectId, allTopicIds, allSubtopicIds, filters)
  }, [subjectId, hasActiveFilters, filters, allTopicIds, allSubtopicIds, fc.refetch])

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
    if (!newFilters.some((f) => f !== 'all')) {
      fc.reset()
    }
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
