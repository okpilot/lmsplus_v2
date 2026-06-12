import { useCallback, useRef, useState } from 'react'
import { getFilteredCount } from '../actions/lookup'
import type { CalcMode, FilteredCountState, QuestionFilterValue } from '../types'

export function useFilteredCount(): FilteredCountState {
  const [filteredCount, setFilteredCount] = useState<number | null>(null)
  const [filteredByTopic, setFilteredByTopic] = useState<Record<string, number> | null>(null)
  const [filteredBySubtopic, setFilteredBySubtopic] = useState<Record<string, number> | null>(null)
  const [isFilterPending, setIsFilterPending] = useState(false)
  const [authError, setAuthError] = useState(false)
  const filterGeneration = useRef(0)

  function reset() {
    filterGeneration.current++
    setFilteredCount(null)
    setFilteredByTopic(null)
    setFilteredBySubtopic(null)
    setIsFilterPending(false)
    setAuthError(false)
  }

  const refetch = useCallback(function refetch(
    subjectId: string,
    topicIds: string[],
    subtopicIds: string[],
    filters: QuestionFilterValue[],
    calcMode: CalcMode = 'all',
  ) {
    if (!subjectId) return
    const activeFilters = filters.filter((f) => f !== 'all')
    // calcMode AND-restricts independently of the switch-filters, so a calc-only
    // selection must fetch even when no switch-filter is active.
    if (!activeFilters.length && calcMode === 'all') return
    setFilteredCount(null)
    setFilteredByTopic(null)
    setFilteredBySubtopic(null)
    setAuthError(false)
    filterGeneration.current++
    const gen = filterGeneration.current
    setIsFilterPending(true)
    getFilteredCount({ subjectId, topicIds, subtopicIds, filters: activeFilters, calcMode })
      .then((result) => {
        if (gen !== filterGeneration.current) return
        if (result.error === 'auth') {
          setAuthError(true)
          return
        }
        setFilteredCount(result.count)
        setFilteredByTopic(result.byTopic)
        setFilteredBySubtopic(result.bySubtopic)
      })
      .catch(() => undefined)
      .finally(() => {
        if (gen === filterGeneration.current) setIsFilterPending(false)
      })
  }, [])

  return {
    filteredCount,
    filteredByTopic,
    filteredBySubtopic,
    isFilterPending,
    authError,
    refetch,
    reset,
  }
}
