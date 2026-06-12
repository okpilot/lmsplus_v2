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
  // Current reactive values the change handlers read to decide reset-vs-keep.
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
    // Mirror handleFiltersChange: clear counts only when nothing restricts the pool.
    // The counts effect (calcMode is in its dep array, guarded on allTopicIds being
    // loaded) performs the refetch after state settles — no direct refetch here, which
    // avoids both a double fetch and the empty-topics-before-load race.
    if (!filters.some((f) => f !== 'all') && newCalcMode === 'all') fc.reset()
  }

  return { handleSubjectChange, handleFiltersChange, handleCalcModeChange }
}
