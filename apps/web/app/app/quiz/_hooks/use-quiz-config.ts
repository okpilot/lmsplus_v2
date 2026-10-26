import type { SubjectOption, TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import type { PreloadPromise, QuizMode } from '../types'
import { useAvailableCount } from './use-available-count'
import { useFilteredCount } from './use-filtered-count'
import { useFilteredCountSync } from './use-filtered-count-sync'
import { useQuizConfigState } from './use-quiz-config-state'
import { useQuizStart } from './use-quiz-start'
import { useTopicTree } from './use-topic-tree'

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
export function useQuizConfig({
  subjects,
  initialSubjectId,
  initialMode,
  initialTopics,
  preload,
}: {
  subjects: SubjectOption[]
  initialSubjectId?: string
  initialMode?: QuizMode
  initialTopics?: TopicWithSubtopics[]
  preload?: PreloadPromise
}) {
  const topicTree = useTopicTree(initialTopics)
  const fc = useFilteredCount(preload)
  const st = useQuizConfigState({ fc, topicTree, initialSubjectId, initialMode, preload })

  const availableCount = useAvailableCount({
    hasActiveFilters: st.hasActiveFilters,
    filteredByTopic: fc.filteredByTopic,
    filteredBySubtopic: fc.filteredBySubtopic,
    topicTree,
  })
  const { loading, error, handleStart, blocked } = useQuizStart({
    subjectId: st.subjectId,
    subjects,
    count: st.count,
    maxQuestions: availableCount,
    filters: st.filters,
    calcMode: st.calcMode,
    imageMode: st.imageMode,
    topicTree,
  })

  useFilteredCountSync({
    subjectId: st.subjectId,
    hasActiveFilters: st.hasActiveFilters,
    filters: st.filters,
    calcMode: st.calcMode,
    imageMode: st.imageMode,
    topicTree,
    fc,
  })

  return {
    subjectId: st.subjectId,
    mode: st.mode,
    setMode: st.setMode,
    filters: st.filters,
    setFilters: st.handleFiltersChange,
    calcMode: st.calcMode,
    setCalcMode: st.handleCalcModeChange,
    imageMode: st.imageMode,
    setImageMode: st.handleImageModeChange,
    count: st.count,
    setCount: st.setCount,
    availableCount,
    topicTree,
    filteredByTopic: st.hasActiveFilters ? fc.filteredByTopic : null,
    filteredBySubtopic: st.hasActiveFilters ? fc.filteredBySubtopic : null,
    loading,
    error,
    authError: fc.authError,
    isPending: topicTree.isPending || fc.isFilterPending,
    handleSubjectChange: st.handleSubjectChange,
    handleStart,
    blocked,
  }
}
