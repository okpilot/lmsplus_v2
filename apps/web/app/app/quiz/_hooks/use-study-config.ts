import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { useAvailableCount } from './use-available-count'
import { useFilteredCount } from './use-filtered-count'
import { useFilteredCountSync } from './use-filtered-count-sync'
import { useQuizConfigState } from './use-quiz-config-state'
import { useStudyStart } from './use-study-start'
import { useTopicTree } from './use-topic-tree'

/**
 * Discovery-mode config orchestration. Mirrors useQuizConfig's quiz branch (minus
 * exam mode): like "New Quiz" it NAVIGATES to /app/quiz/session on start (use-study-
 * start writes the pre-marked handoff and reuses the real session runner).
 *
 * NOTE — `availableCount` (slider max) is TYPE-AGNOSTIC (shared count path counts
 * all types), but the discovery FETCH is MC-only (`startStudy`). On a mixed MC/
 * non-MC subject the count overstates the real MC pool; a fully-non-MC selection
 * falls back to the empty-state message. DORMANT today (picker is MC-only). #1003.
 */
export function useStudyConfig({
  userId,
  subjects,
}: {
  userId: string
  subjects: SubjectOption[]
}) {
  const topicTree = useTopicTree()
  const fc = useFilteredCount()
  const st = useQuizConfigState({ fc, topicTree })

  const availableCount = useAvailableCount({
    hasActiveFilters: st.hasActiveFilters,
    filteredByTopic: fc.filteredByTopic,
    filteredBySubtopic: fc.filteredBySubtopic,
    topicTree,
  })

  const { loading, error, handleStart } = useStudyStart({
    userId,
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
    loading,
    error,
    handleStart,
  }
}
