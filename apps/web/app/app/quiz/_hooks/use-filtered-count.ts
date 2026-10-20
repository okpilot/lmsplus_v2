import { useCallback, useRef, useState } from 'react'
import type { FilteredCounts } from '@/lib/queries/discovery-counts'
import { findPreloadedCount, freshCounts } from '../_utils/preloaded-discovery-count'
import { getFilteredCount } from '../actions/lookup'
import type { FilteredCountState } from '../session-types'
import type { CalcMode, ImageMode, PreloadPromise, QuestionFilterValue } from '../types'
import { usePreloadedSetup } from './use-preloaded-setup'

/** @param preload Streamed server counts; read at call time and used instead of a request when they apply. */
export function useFilteredCount(preload?: PreloadPromise): FilteredCountState {
  const setup = usePreloadedSetup(preload)
  const [counts, setCounts] = useState<FilteredCounts | null>(null)
  const [isFilterPending, setIsFilterPending] = useState(false)
  const [authError, setAuthError] = useState(false)
  const filterGeneration = useRef(0)

  function reset() {
    filterGeneration.current++
    setCounts(null)
    setIsFilterPending(false)
    setAuthError(false)
  }

  const refetch = useCallback(
    function refetch(
      subjectId: string,
      topicIds: string[],
      subtopicIds: string[],
      filters: QuestionFilterValue[],
      calcMode: CalcMode = 'all',
      imageMode: ImageMode = 'all',
      // Study/Discovery passes 'multiple_choice' so the count matches the MC-only
      // fetch; the quiz/exam paths omit it (type-agnostic count) (#1008).
      questionType?: 'multiple_choice',
    ) {
      if (!subjectId) return
      const activeFilters = filters.filter((f) => f !== 'all')
      // calcMode / imageMode AND-restrict independently, and Study/Discovery sets
      // questionType — only short-circuit when nothing restricts the pool (#1008).
      if (!questionType && !activeFilters.length && calcMode === 'all' && imageMode === 'all')
        return
      setAuthError(false)
      filterGeneration.current++
      const gen = filterGeneration.current
      const query = { subjectId, filters: activeFilters, calcMode, imageMode, questionType }
      const preloaded = findPreloadedCount(freshCounts(setup.current, Date.now()), query)
      setCounts(preloaded)
      setIsFilterPending(!preloaded)
      if (preloaded) return
      getFilteredCount({ ...query, topicIds, subtopicIds })
        .then((result) => {
          if (gen !== filterGeneration.current) return
          if (result.error === 'auth') {
            setAuthError(true)
            return
          }
          setCounts(result)
        })
        .catch(() => undefined)
        .finally(() => {
          if (gen === filterGeneration.current) setIsFilterPending(false)
        })
    },
    [setup],
  )

  return {
    filteredCount: counts?.count ?? null,
    filteredByTopic: counts?.byTopic ?? null,
    filteredBySubtopic: counts?.bySubtopic ?? null,
    isFilterPending,
    authError,
    refetch,
    reset,
  }
}
