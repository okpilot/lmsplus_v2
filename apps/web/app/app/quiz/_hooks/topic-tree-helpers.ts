import type { TopicWithSubtopics } from '@/lib/queries/quiz'

export type UseTopicTreeReturn = {
  topics: TopicWithSubtopics[]
  checkedTopics: Set<string>
  checkedSubtopics: Set<string>
  allSelected: boolean
  isPending: boolean
  totalQuestions: number
  selectedQuestionCount: number
  loadTopics: (subjectId: string) => void
  toggleTopic: (topicId: string) => void
  toggleSubtopic: (subtopicId: string, topicId: string) => void
  selectAll: () => void
  reset: () => void
  getSelectedTopicIds: () => string[]
  getSelectedSubtopicIds: () => string[]
}

export function calcSelectedCount(
  topics: TopicWithSubtopics[],
  checkedTopics: Set<string>,
  checkedSubtopics: Set<string>,
): number {
  return topics.reduce((sum, t) => {
    if (t.subtopics.length === 0) return sum + (checkedTopics.has(t.id) ? t.questionCount : 0)
    return (
      sum +
      t.subtopics.reduce((s, st) => s + (checkedSubtopics.has(st.id) ? st.questionCount : 0), 0)
    )
  }, 0)
}
