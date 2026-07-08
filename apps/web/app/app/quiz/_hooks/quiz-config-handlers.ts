import type { QuestionType } from '@/app/app/_types/session'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
import type { useFilteredCount } from './use-filtered-count'
import type { useTopicTree } from './use-topic-tree'

type ConfigHandlerDeps = {
  setSubjectId: (id: string) => void
  setFilters: (f: QuestionFilterValue[]) => void
  setCount: (n: number) => void
  setCalcMode: (m: CalcMode) => void
  setImageMode: (m: ImageMode) => void
  setQuestionType: (t: QuestionType | undefined) => void
  fc: ReturnType<typeof useFilteredCount>
  topicTree: ReturnType<typeof useTopicTree>
  // Current reactive values the change handlers read to decide reset-vs-keep.
  filters: QuestionFilterValue[]
  calcMode: CalcMode
  imageMode: ImageMode
  questionType: QuestionType | undefined
}

export function createConfigHandlers({
  setSubjectId,
  setFilters,
  setCount,
  setCalcMode,
  setImageMode,
  setQuestionType,
  fc,
  topicTree,
  filters,
  calcMode,
  imageMode,
  questionType,
}: ConfigHandlerDeps) {
  // handleSubjectChange is a full reset — it clears every dimension together, so it
  // resets counts unconditionally. The four partial-change handlers below each clear
  // counts only when NO dimension still restricts the pool, to avoid an
  // unfiltered-count flash when one filter clears while others remain active.
  function handleSubjectChange(id: string) {
    setSubjectId(id)
    fc.reset()
    setFilters(['all'])
    setCalcMode('all')
    setImageMode('all')
    setQuestionType(undefined)
    setCount(10)
    if (id) topicTree.loadTopics(id)
    else topicTree.reset()
  }

  function handleFiltersChange(newFilters: QuestionFilterValue[]) {
    setFilters(newFilters)
    // Only clear counts when NOTHING is active — if calcMode/imageMode/questionType
    // still restricts the pool, keep the badge and let the filters effect refetch
    // (avoids an unfiltered-count flash).
    if (
      !newFilters.some((f) => f !== 'all') &&
      calcMode === 'all' &&
      imageMode === 'all' &&
      questionType === undefined
    ) {
      fc.reset()
    }
  }

  function handleCalcModeChange(newCalcMode: CalcMode) {
    setCalcMode(newCalcMode)
    // Mirror handleFiltersChange: clear counts only when nothing restricts the pool.
    // The counts effect (calcMode is in its dep array, guarded on allTopicIds being
    // loaded) performs the refetch after state settles — no direct refetch here, which
    // avoids both a double fetch and the empty-topics-before-load race.
    if (
      !filters.some((f) => f !== 'all') &&
      newCalcMode === 'all' &&
      imageMode === 'all' &&
      questionType === undefined
    ) {
      fc.reset()
    }
  }

  function handleImageModeChange(newImageMode: ImageMode) {
    setImageMode(newImageMode)
    // Same reset rule as handleCalcModeChange; the counts effect performs the refetch.
    if (
      !filters.some((f) => f !== 'all') &&
      calcMode === 'all' &&
      newImageMode === 'all' &&
      questionType === undefined
    ) {
      fc.reset()
    }
  }

  function handleQuestionTypeChange(newQuestionType: QuestionType | undefined) {
    setQuestionType(newQuestionType)
    // Same reset rule as handleCalcModeChange/handleImageModeChange; the counts
    // effect (questionType is in its dep array) performs the refetch.
    if (
      !filters.some((f) => f !== 'all') &&
      calcMode === 'all' &&
      imageMode === 'all' &&
      newQuestionType === undefined
    ) {
      fc.reset()
    }
  }

  return {
    handleSubjectChange,
    handleFiltersChange,
    handleCalcModeChange,
    handleImageModeChange,
    handleQuestionTypeChange,
  }
}
