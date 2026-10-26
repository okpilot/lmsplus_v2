import { useCallback, useRef, useState } from 'react'
import type { FilteredCounts } from '@/lib/queries/discovery-counts'
import { findPreloadedCount } from '../_utils/preloaded-discovery-count'
import { getFilteredCount } from '../actions/lookup'
import type { FilteredCountState } from '../session-types'
import type { CalcMode, ImageMode, PreloadPromise, QuestionFilterValue } from '../types'
import { usePreloadedSetup } from './use-preloaded-setup'

type CountQuery = {
  subjectId: string
  filters: QuestionFilterValue[]
  calcMode: CalcMode
  imageMode: ImageMode
  questionType?: 'multiple_choice'
}
type CountRequest = Parameters<typeof getFilteredCount>[0]
type CountResult = Awaited<ReturnType<typeof getFilteredCount>> | null
type SettleRefs = {
  generation: { current: number }
  lastKey: { current: string | null }
  inFlightKey: { current: string | null }
  setCounts: (counts: FilteredCounts) => void
  setAuthError: (value: boolean) => void
  setIsFilterPending: (value: boolean) => void
}
type Settle = SettleRefs & { gen: number; key: string }

/** The restricting query, or null when nothing restricts the pool. */
function toCountQuery(args: CountQuery) {
  const activeFilters = args.filters.filter((f) => f !== 'all')
  // calcMode / imageMode AND-restrict independently, and Study/Discovery sets
  // questionType — only short-circuit when nothing restricts the pool (#1008).
  if (
    !args.questionType &&
    !activeFilters.length &&
    args.calcMode === 'all' &&
    args.imageMode === 'all'
  )
    return null
  const { subjectId, calcMode, imageMode, questionType } = args
  return { subjectId, filters: activeFilters, calcMode, imageMode, questionType }
}

// While a preload has not landed, one microtask lets an already-settled one arrive
// before the server is asked; `readPreload` is passed only in that case.
async function resolveCounts(
  request: CountRequest,
  readPreload: (() => FilteredCounts | null | undefined) | undefined,
  isCurrent: () => boolean,
): Promise<CountResult> {
  await Promise.resolve()
  if (!readPreload) return getFilteredCount(request)
  if (!isCurrent()) return null
  return readPreload() ?? getFilteredCount(request)
}

function settleCounts(ctx: Settle, request: Promise<CountResult>) {
  const current = () => ctx.gen === ctx.generation.current
  request
    .then((result) => {
      if (!result || !current()) return
      if ('error' in result && result.error === 'auth') {
        ctx.setAuthError(true)
        return
      }
      ctx.lastKey.current = ctx.key
      ctx.setCounts(result)
    })
    .catch(() => undefined)
    .finally(() => {
      if (!current()) return
      ctx.inFlightKey.current = null
      ctx.setIsFilterPending(false)
    })
}

/** @param preload Streamed server counts; read at call time and used instead of a request when they apply. */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: hook state + refetch wiring; logic in module helpers
export function useFilteredCount(preload?: PreloadPromise): FilteredCountState {
  const setup = usePreloadedSetup(preload)
  const hasPreload = preload !== undefined
  const [counts, setCounts] = useState<FilteredCounts | null>(null)
  const [isFilterPending, setIsFilterPending] = useState(false)
  const [authError, setAuthError] = useState(false)
  const filterGeneration = useRef(0)
  const lastKey = useRef<string | null>(null)
  const inFlightKey = useRef<string | null>(null)

  // Stable refs and setters only: not reactive.
  const [settleRefs] = useState<SettleRefs>(() => ({
    generation: filterGeneration,
    lastKey,
    inFlightKey,
    setCounts,
    setAuthError,
    setIsFilterPending,
  }))

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
    // biome-ignore lint/complexity/useMaxParams: positional API used by use-filtered-count-sync.ts and tests
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
      const query =
        subjectId && toCountQuery({ subjectId, filters, calcMode, imageMode, questionType })
      if (!query) return
      const key = JSON.stringify([query, topicIds, subtopicIds])
      const sameKey = key === lastKey.current
      const readPreload = () => findPreloadedCount(setup.ref.current?.discoveryCounts, query)
      const preloaded = readPreload()
      // The identical request is already running and no preload answers it: let it finish.
      if (!preloaded && key === inFlightKey.current) return
      setAuthError(false)
      const gen = ++filterGeneration.current
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
      const awaited = hasPreload && !setup.ref.current ? readPreload : undefined
      const isCurrent = () => gen === filterGeneration.current
      const request = resolveCounts({ ...query, topicIds, subtopicIds }, awaited, isCurrent)
      settleCounts({ ...settleRefs, gen, key }, request)
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
