import { useCallback, useRef, useState } from 'react'
import type { FilteredCounts } from '@/lib/queries/discovery-counts'
import { findPreloadedCount } from '../_utils/preloaded-discovery-count'
import { getFilteredCount } from '../actions/lookup'
import type { FilteredCountState } from '../session-types'
import type { CalcMode, ImageMode, PreloadPromise, QuestionFilterValue } from '../types'
import { usePreloadedSetup } from './use-preloaded-setup'

/** @param preload Streamed server counts; read at call time and used instead of a request when they apply. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
export function useFilteredCount(preload?: PreloadPromise): FilteredCountState {
  const setup = usePreloadedSetup(preload)
  const hasPreload = preload !== undefined
  const [counts, setCounts] = useState<FilteredCounts | null>(null)
  const [isFilterPending, setIsFilterPending] = useState(false)
  const [authError, setAuthError] = useState(false)
  const filterGeneration = useRef(0)
  const lastKey = useRef<string | null>(null)
  const inFlightKey = useRef<string | null>(null)

  function reset() {
    filterGeneration.current++
    lastKey.current = null
    inFlightKey.current = null
    setCounts(null)
    setIsFilterPending(false)
    setAuthError(false)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `setup.resolved` is the trigger that re-runs the current selection when a refreshed preload lands
  const refetch = useCallback(
    // biome-ignore lint/complexity/useMaxParams: pre-existing; split when next edited (#1606)
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
      const query = { subjectId, filters: activeFilters, calcMode, imageMode, questionType }
      const key = JSON.stringify([query, topicIds, subtopicIds])
      const sameKey = key === lastKey.current
      const preloaded = findPreloadedCount(setup.ref.current?.discoveryCounts, query)
      // The identical request is already running and no preload answers it: let it finish.
      if (!preloaded && key === inFlightKey.current) return
      setAuthError(false)
      filterGeneration.current++
      const gen = filterGeneration.current
      // Names the counts shown; a request sets it only when its counts land.
      lastKey.current = preloaded ? key : null
      if (preloaded) {
        inFlightKey.current = null
        setCounts(preloaded)
        setIsFilterPending(false)
        return
      }
      // Same selection: keep what is shown while the request revalidates.
      if (!sameKey) {
        setCounts(null)
        setIsFilterPending(true)
      }
      inFlightKey.current = key
      // While a preload has not landed, one microtask lets an already-settled one arrive
      // before the server is asked.
      const awaitingPreload = hasPreload && !setup.ref.current
      Promise.resolve()
        .then(() => {
          if (!awaitingPreload) return getFilteredCount({ ...query, topicIds, subtopicIds })
          if (gen !== filterGeneration.current) return null
          return (
            findPreloadedCount(setup.ref.current?.discoveryCounts, query) ??
            getFilteredCount({ ...query, topicIds, subtopicIds })
          )
        })
        .then((result) => {
          if (!result || gen !== filterGeneration.current) return
          if ('error' in result && result.error === 'auth') {
            setAuthError(true)
            return
          }
          lastKey.current = key
          setCounts(result)
        })
        .catch(() => undefined)
        .finally(() => {
          if (gen !== filterGeneration.current) return
          inFlightKey.current = null
          setIsFilterPending(false)
        })
    },
    [setup.ref, setup.resolved, hasPreload],
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
