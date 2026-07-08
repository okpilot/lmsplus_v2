import type { RefObject } from 'react'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { fetchTopicsWithSubtopics } from '../actions/lookup'
import {
  collectSubtopicIds,
  computeSelectAll,
  computeToggleSubtopic,
  computeToggleTopic,
} from './topic-tree-helpers'

type TopicTreeActionDeps = {
  topics: TopicWithSubtopics[]
  checkedTopics: Set<string>
  checkedSubtopics: Set<string>
  allSelected: boolean
  setTopics: (t: TopicWithSubtopics[]) => void
  setCheckedTopics: (s: Set<string>) => void
  setCheckedSubtopics: (s: Set<string>) => void
  generation: RefObject<number>
  startTransition: (callback: () => Promise<void> | void) => void
}

/**
 * Builds the imperative topic-tree action functions (load/toggle/select/reset).
 * Extracted from useTopicTree so that hook stays within the 80-line file cap.
 */
export function createTopicTreeActions({
  topics,
  checkedTopics,
  checkedSubtopics,
  allSelected,
  setTopics,
  setCheckedTopics,
  setCheckedSubtopics,
  generation,
  startTransition,
}: TopicTreeActionDeps) {
  function loadTopics(subjectId: string) {
    generation.current++
    const gen = generation.current
    startTransition(async () => {
      const result = await fetchTopicsWithSubtopics(subjectId)
      if (gen !== generation.current) return
      setTopics(result)
      setCheckedTopics(new Set(result.map((t) => t.id)))
      setCheckedSubtopics(new Set(collectSubtopicIds(result)))
    })
  }

  function toggleTopic(topicId: string) {
    const result = computeToggleTopic(topicId, topics, checkedTopics, checkedSubtopics)
    setCheckedTopics(result.topics)
    setCheckedSubtopics(result.subtopics)
  }

  function toggleSubtopic(subtopicId: string, topicId: string) {
    const result = computeToggleSubtopic(
      subtopicId,
      topicId,
      topics,
      checkedTopics,
      checkedSubtopics,
    )
    setCheckedTopics(result.topics)
    setCheckedSubtopics(result.subtopics)
  }

  function selectAll() {
    const result = computeSelectAll(allSelected, topics)
    setCheckedTopics(result.topics)
    setCheckedSubtopics(result.subtopics)
  }

  function reset() {
    generation.current++
    setTopics([])
    setCheckedTopics(new Set())
    setCheckedSubtopics(new Set())
  }

  return { loadTopics, toggleTopic, toggleSubtopic, selectAll, reset }
}
