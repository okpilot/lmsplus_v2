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
  setLoading: (v: boolean) => void
  generation: RefObject<number>
  startTransition: (callback: () => Promise<void> | void) => void
}

/**
 * Builds the imperative topic-tree action functions (load/toggle/select/reset).
 * Extracted from useTopicTree.
 */
export function createTopicTreeActions({
  topics,
  checkedTopics,
  checkedSubtopics,
  allSelected,
  setTopics,
  setCheckedTopics,
  setCheckedSubtopics,
  setLoading,
  generation,
  startTransition,
}: TopicTreeActionDeps) {
  function applyLoadedTopics(result: TopicWithSubtopics[]) {
    setTopics(result)
    setCheckedTopics(new Set(result.map((t) => t.id)))
    setCheckedSubtopics(new Set(collectSubtopicIds(result)))
  }

  /** Shows an already-fetched tree synchronously, cancelling any load still in flight. */
  function applyTopics(result: TopicWithSubtopics[]) {
    generation.current++
    setLoading(false)
    applyLoadedTopics(result)
  }

  function loadTopics(subjectId: string) {
    generation.current++
    const gen = generation.current
    setLoading(true)
    startTransition(async () => {
      const result = await fetchTopicsWithSubtopics(subjectId)
      if (gen !== generation.current) return
      // Post-await updates in an async transition action are NOT auto-included in
      // the transition (React 19) — nest startTransition so the topic-tree re-render
      // keeps its non-blocking priority.
      startTransition(() => {
        setLoading(false)
        applyLoadedTopics(result)
      })
    })
  }

  function applySelection(result: { topics: Set<string>; subtopics: Set<string> }) {
    setCheckedTopics(result.topics)
    setCheckedSubtopics(result.subtopics)
  }

  function toggleTopic(topicId: string) {
    applySelection(computeToggleTopic(topicId, topics, checkedTopics, checkedSubtopics))
  }

  function toggleSubtopic(subtopicId: string, topicId: string) {
    applySelection(
      computeToggleSubtopic(subtopicId, topicId, topics, checkedTopics, checkedSubtopics),
    )
  }

  function selectAll() {
    applySelection(computeSelectAll(allSelected, topics))
  }

  function reset() {
    generation.current++
    setLoading(false)
    setTopics([])
    setCheckedTopics(new Set())
    setCheckedSubtopics(new Set())
  }

  return { loadTopics, applyTopics, toggleTopic, toggleSubtopic, selectAll, reset }
}
