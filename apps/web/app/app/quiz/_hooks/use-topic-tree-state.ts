import { useState } from 'react'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { collectSubtopicIds } from './topic-tree-helpers'

/**
 * Owns the raw topics/checkedTopics/checkedSubtopics state for useTopicTree,
 * seeded from `initialTopics` when provided (e.g. VFR RT's server-fetched
 * topics, all checked by default) or empty otherwise (the ordinary
 * quiz-picker path, populated later via `loadTopics`). Extracted so
 * useTopicTree stays within the 80-line hook file cap.
 */
export function useTopicTreeState(initialTopics?: TopicWithSubtopics[]) {
  const [topics, setTopics] = useState<TopicWithSubtopics[]>(() => initialTopics ?? [])
  const [checkedTopics, setCheckedTopics] = useState<Set<string>>(
    () => new Set((initialTopics ?? []).map((t) => t.id)),
  )
  const [checkedSubtopics, setCheckedSubtopics] = useState<Set<string>>(
    () => new Set(collectSubtopicIds(initialTopics ?? [])),
  )

  return {
    topics,
    setTopics,
    checkedTopics,
    setCheckedTopics,
    checkedSubtopics,
    setCheckedSubtopics,
  }
}
