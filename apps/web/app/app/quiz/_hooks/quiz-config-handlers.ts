import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
import type { useFilteredCount } from './use-filtered-count'
import type { useTopicTree } from './use-topic-tree'

type ConfigHandlerDeps = {
  setSubjectId: (id: string) => void
  setFilters: (f: QuestionFilterValue[]) => void
  setCount: (n: number) => void
  setCalcMode: (m: CalcMode) => void
  setImageMode: (m: ImageMode) => void
  fc: ReturnType<typeof useFilteredCount>
  topicTree: ReturnType<typeof useTopicTree>
  // Current reactive values the change handlers read to decide reset-vs-keep.
  filters: QuestionFilterValue[]
  calcMode: CalcMode
  imageMode: ImageMode
}

export function createConfigHandlers({
  setSubjectId,
  setFilters,
  setCount,
  setCalcMode,
  setImageMode,
  fc,
  topicTree,
  filters,
  calcMode,
  imageMode,
}: ConfigHandlerDeps) {
  // Each handler clears counts only when NO dimension still restricts the pool —
  // this prevents an unfiltered-count flash when a single filter clears while others
  // remain active (see the per-handler reset guards below).
  function handleSubjectChange(id: string) {
    setSubjectId(id)
    fc.reset()
    setFilters(['all'])
    setCalcMode('all')
    setImageMode('all')
    setCount(10)
    if (id) topicTree.loadTopics(id)
    else topicTree.reset()
  }

  function handleFiltersChange(newFilters: QuestionFilterValue[]) {
    setFilters(newFilters)
    // Only clear counts when NOTHING is active — if calcMode/imageMode still restricts
    // the pool, keep the badge and let the filters effect refetch (avoids an
    // unfiltered-count flash).
    if (!newFilters.some((f) => f !== 'all') && calcMode === 'all' && imageMode === 'all') {
      fc.reset()
    }
  }

  function handleCalcModeChange(newCalcMode: CalcMode) {
    setCalcMode(newCalcMode)
    // Mirror handleFiltersChange: clear counts only when nothing restricts the pool.
    // The counts effect (calcMode is in its dep array, guarded on allTopicIds being
    // loaded) performs the refetch after state settles — no direct refetch here, which
    // avoids both a double fetch and the empty-topics-before-load race.
    if (!filters.some((f) => f !== 'all') && newCalcMode === 'all' && imageMode === 'all') {
      fc.reset()
    }
  }

  function handleImageModeChange(newImageMode: ImageMode) {
    setImageMode(newImageMode)
    // Same reset rule as handleCalcModeChange; the counts effect performs the refetch.
    if (!filters.some((f) => f !== 'all') && calcMode === 'all' && newImageMode === 'all') {
      fc.reset()
    }
  }

  return { handleSubjectChange, handleFiltersChange, handleCalcModeChange, handleImageModeChange }
}
