import { useRef, useTransition } from 'react'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { createTopicTreeActions } from './topic-tree-actions'
import { calcSelectedCount } from './topic-tree-helpers'
import { useTopicTreeState } from './use-topic-tree-state'

/**
 * @param initialTopics Server-fetched topics to seed the tree with (e.g. a
 * subject-locked form like VFR RT, where the RSC fetches topics up front).
 * All topics/subtopics start checked, mirroring what `loadTopics` sets after
 * a client fetch. Omit for the ordinary quiz-picker path, which starts empty
 * and populates via `loadTopics` on subject change.
 */
export function useTopicTree(initialTopics?: TopicWithSubtopics[]) {
  const {
    topics,
    setTopics,
    checkedTopics,
    setCheckedTopics,
    checkedSubtopics,
    setCheckedSubtopics,
  } = useTopicTreeState(initialTopics)
  const [isPending, startTransition] = useTransition()
  const generation = useRef(0)

  const totalQuestions = topics.reduce((sum, t) => sum + t.questionCount, 0)
  const selectedQuestionCount = calcSelectedCount(topics, checkedTopics, checkedSubtopics)
  const allSelected =
    topics.length > 0 &&
    topics.every(
      (t) => checkedTopics.has(t.id) && t.subtopics.every((st) => checkedSubtopics.has(st.id)),
    )

  const { loadTopics, toggleTopic, toggleSubtopic, selectAll, reset } = createTopicTreeActions({
    topics,
    checkedTopics,
    checkedSubtopics,
    allSelected,
    setTopics,
    setCheckedTopics,
    setCheckedSubtopics,
    generation,
    startTransition,
  })

  return {
    topics,
    checkedTopics,
    checkedSubtopics,
    allSelected,
    isPending,
    totalQuestions,
    selectedQuestionCount,
    loadTopics,
    toggleTopic,
    toggleSubtopic,
    selectAll,
    reset,
    getSelectedTopicIds: () => [...checkedTopics],
    getSelectedSubtopicIds: () => [...checkedSubtopics],
  }
}
