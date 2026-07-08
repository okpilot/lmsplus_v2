import type { UseQuizConfigOpts } from '../session-types'
import { useAvailableCount } from './use-available-count'
import { useFilteredCount } from './use-filtered-count'
import { useFilteredCountSync } from './use-filtered-count-sync'
import { useQuizConfigState } from './use-quiz-config-state'
import { useQuizStart } from './use-quiz-start'
import { useTopicTree } from './use-topic-tree'

export function useQuizConfig({
  userId,
  subjects,
  initialSubjectId,
  initialMode,
  initialTopics,
}: UseQuizConfigOpts) {
  const topicTree = useTopicTree(initialTopics)
  const fc = useFilteredCount()
  const st = useQuizConfigState({ fc, topicTree, initialSubjectId, initialMode })

  const availableCount = useAvailableCount({
    hasActiveFilters: st.hasActiveFilters,
    filteredByTopic: fc.filteredByTopic,
    filteredBySubtopic: fc.filteredBySubtopic,
    topicTree,
  })
  const { loading, error, handleStart } = useQuizStart({
    userId,
    subjectId: st.subjectId,
    subjects,
    count: st.count,
    maxQuestions: availableCount,
    filters: st.filters,
    calcMode: st.calcMode,
    imageMode: st.imageMode,
    questionType: st.questionType,
    topicTree,
  })

  useFilteredCountSync({
    subjectId: st.subjectId,
    hasActiveFilters: st.hasActiveFilters,
    filters: st.filters,
    calcMode: st.calcMode,
    imageMode: st.imageMode,
    questionType: st.questionType,
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
    questionType: st.questionType,
    setQuestionType: st.handleQuestionTypeChange,
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
  }
}
