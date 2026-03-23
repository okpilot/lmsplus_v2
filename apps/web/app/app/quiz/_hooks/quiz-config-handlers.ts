import type { QuestionFilterValue } from '../types'
import type { useFilteredCount } from './use-filtered-count'
import type { useTopicTree } from './use-topic-tree'

type ConfigHandlerDeps = {
  setSubjectId: (id: string) => void
  setFilters: (f: QuestionFilterValue[]) => void
  setCount: (n: number) => void
  fc: ReturnType<typeof useFilteredCount>
  topicTree: ReturnType<typeof useTopicTree>
}

export function createConfigHandlers({
  setSubjectId,
  setFilters,
  setCount,
  fc,
  topicTree,
}: ConfigHandlerDeps) {
  function handleSubjectChange(id: string) {
    setSubjectId(id)
    fc.reset()
    setFilters(['all'])
    setCount(10)
    if (id) topicTree.loadTopics(id)
    else topicTree.reset()
  }

  function handleFiltersChange(newFilters: QuestionFilterValue[]) {
    setFilters(newFilters)
    if (!newFilters.some((f) => f !== 'all')) fc.reset()
  }

  return { handleSubjectChange, handleFiltersChange }
}
