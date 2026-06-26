import { useAvailableCount } from './use-available-count'
import { useFilteredCount } from './use-filtered-count'
import { useFilteredCountSync } from './use-filtered-count-sync'
import { useQuizConfigState } from './use-quiz-config-state'
import { useTopicTree } from './use-topic-tree'

/**
 * Study-mode config orchestration. Mirrors useQuizConfig's quiz branch but drops
 * exam mode and the navigation-based start (study renders its runner in place via
 * use-study-start). Reuses the same filter/topic/count sub-hooks so the builder
 * UI behaves identically to "New Quiz".
 *
 * NOTE — `availableCount` (and the slider max) is TYPE-AGNOSTIC: it reuses the
 * shared count path (subject/topic totals + get_filtered_question_counts), which
 * counts all question types. The study FETCH, by contrast, is MC-only
 * (`startStudy` → getRandomQuestionIds(questionType: 'multiple_choice')). On a
 * subject that mixes MC with non-MC questions the displayed count would overstate
 * the real MC pool, and a fully-non-MC selection falls back to the runner's
 * empty-state. This is DORMANT today (every subject in the picker is MC-only; the
 * non-MC RT subject is delisted from getSubjectsWithCounts). Making the count
 * MC-aware touches the shared quiz count infrastructure — tracked as #1003.
 */
export function useStudyConfig() {
  const topicTree = useTopicTree()
  const fc = useFilteredCount()
  const st = useQuizConfigState({ fc, topicTree })

  const availableCount = useAvailableCount({
    hasActiveFilters: st.hasActiveFilters,
    filteredByTopic: fc.filteredByTopic,
    filteredBySubtopic: fc.filteredBySubtopic,
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
    authError: fc.authError,
    isPending: topicTree.isPending || fc.isFilterPending,
    handleSubjectChange: st.handleSubjectChange,
  }
}
