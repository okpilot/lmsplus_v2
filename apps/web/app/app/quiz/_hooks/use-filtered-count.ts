import { useRef, useState, useTransition } from 'react'
import { getFilteredCount } from '../actions/lookup'
import type { QuestionFilterValue } from '../types'

export type FilteredCountState = {
  filteredCount: number | null
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
  isFilterPending: boolean
  refetch: (
    subjectId: string,
    topicIds: string[],
    subtopicIds: string[],
    filters: QuestionFilterValue[],
  ) => void
  reset: () => void
}

export function useFilteredCount(): FilteredCountState {
  const [filteredCount, setFilteredCount] = useState<number | null>(null)
  const [filteredByTopic, setFilteredByTopic] = useState<Record<string, number> | null>(null)
  const [filteredBySubtopic, setFilteredBySubtopic] = useState<Record<string, number> | null>(null)
  const [isFilterPending, startFilterTransition] = useTransition()
  const filterGeneration = useRef(0)

  function reset() {
    setFilteredCount(null)
    setFilteredByTopic(null)
    setFilteredBySubtopic(null)
  }

  function refetch(
    subjectId: string,
    topicIds: string[],
    subtopicIds: string[],
    filters: QuestionFilterValue[],
  ) {
    reset()
    if (!subjectId) return
    const activeFilters = filters.filter((f) => f !== 'all')
    if (!activeFilters.length) return
    filterGeneration.current++
    const gen = filterGeneration.current
    startFilterTransition(async () => {
      const result = await getFilteredCount({
        subjectId,
        topicIds,
        subtopicIds,
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
    isFilterPending,
    refetch,
    reset,
  }
}
