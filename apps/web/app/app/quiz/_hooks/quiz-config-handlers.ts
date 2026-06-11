import type { CalcMode, QuestionFilterValue } from '../types'
import type { useFilteredCount } from './use-filtered-count'
import type { useTopicTree } from './use-topic-tree'

type ConfigHandlerDeps = {
  setSubjectId: (id: string) => void
  setFilters: (f: QuestionFilterValue[]) => void
  setCount: (n: number) => void
  setCalcMode: (m: CalcMode) => void
  fc: ReturnType<typeof useFilteredCount>
  topicTree: ReturnType<typeof useTopicTree>
  // Current reactive values needed to refetch counts when calcMode changes — the
  // calc Select fires outside the filters effect, so it triggers its own refetch.
  subjectId: string
  allTopicIds: string[]
  allSubtopicIds: string[]
  filters: QuestionFilterValue[]
  calcMode: CalcMode
}

export function createConfigHandlers({
  setSubjectId,
  setFilters,
  setCount,
  setCalcMode,
  fc,
  topicTree,
  subjectId,
  allTopicIds,
  allSubtopicIds,
  filters,
  calcMode,
}: ConfigHandlerDeps) {
  function handleSubjectChange(id: string) {
    setSubjectId(id)
    fc.reset()
    setFilters(['all'])
    setCalcMode('all')
    setCount(10)
    if (id) topicTree.loadTopics(id)
    else topicTree.reset()
  }

  function handleFiltersChange(newFilters: QuestionFilterValue[]) {
    setFilters(newFilters)
    // Only clear counts when NOTHING is active — if calcMode still restricts the pool,
    // keep the badge and let the filters effect refetch (avoids an unfiltered-count flash).
    if (!newFilters.some((f) => f !== 'all') && calcMode === 'all') fc.reset()
  }

  function handleCalcModeChange(newCalcMode: CalcMode) {
    setCalcMode(newCalcMode)
    // No active switch-filter and calc back to 'all' → nothing to count, clear state.
    if (!filters.some((f) => f !== 'all') && newCalcMode === 'all') {
      fc.reset()
      return
    }
    fc.refetch(subjectId, allTopicIds, allSubtopicIds, filters, newCalcMode)
  }

  return { handleSubjectChange, handleFiltersChange, handleCalcModeChange }
}
