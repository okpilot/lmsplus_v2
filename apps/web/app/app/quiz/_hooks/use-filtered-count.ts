import { useRef, useState, useTransition } from 'react'
import { getFilteredCount } from '../actions/lookup'
import type { QuestionFilterValue } from '../types'

export function useFilteredCount({
  subjectId,
  filters,
  topicTree,
}: {
  subjectId: string
  filters: QuestionFilterValue[]
  topicTree: { getSelectedTopicIds: () => string[]; getSelectedSubtopicIds: () => string[] }
}) {
  const [filteredCount, setFilteredCount] = useState<number | null>(null)
  const [filteredByTopic, setFilteredByTopic] = useState<Record<string, number> | null>(null)
  const [filteredBySubtopic, setFilteredBySubtopic] = useState<Record<string, number> | null>(null)
  const [, startFilterTransition] = useTransition()
  const filterGeneration = useRef(0)

  const hasActiveFilters = filters.some((f) => f !== 'all')

  function refetchFilteredCount(newFilters?: QuestionFilterValue[]) {
    setFilteredCount(null)
    setFilteredByTopic(null)
    setFilteredBySubtopic(null)
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
      if (gen === filterGeneration.current) {
        setFilteredCount(result.count)
        setFilteredByTopic(result.byTopic)
        setFilteredBySubtopic(result.bySubtopic)
      }
    })
  }

  return {
    filteredCount,
    filteredByTopic,
    filteredBySubtopic,
    hasActiveFilters,
    refetchFilteredCount,
  }
}
