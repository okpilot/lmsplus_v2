import { useRef, useState } from 'react'
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
  const [isFilterPending, setIsFilterPending] = useState(false)
  const filterGeneration = useRef(0)

  function reset() {
    filterGeneration.current++
    setFilteredCount(null)
    setFilteredByTopic(null)
    setFilteredBySubtopic(null)
    setIsFilterPending(false)
  }

  function refetch(
    subjectId: string,
    topicIds: string[],
    subtopicIds: string[],
    filters: QuestionFilterValue[],
  ) {
    setFilteredCount(null)
    setFilteredByTopic(null)
    setFilteredBySubtopic(null)
    if (!subjectId) return
    const activeFilters = filters.filter((f) => f !== 'all')
    if (!activeFilters.length) return
    filterGeneration.current++
    const gen = filterGeneration.current
    setIsFilterPending(true)
    getFilteredCount({ subjectId, topicIds, subtopicIds, filters: activeFilters })
      .then((result) => {
        if (gen !== filterGeneration.current) return
        setFilteredCount(result.count)
        setFilteredByTopic(result.byTopic)
        setFilteredBySubtopic(result.bySubtopic)
      })
      .catch(() => undefined)
      .finally(() => {
        if (gen === filterGeneration.current) setIsFilterPending(false)
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
