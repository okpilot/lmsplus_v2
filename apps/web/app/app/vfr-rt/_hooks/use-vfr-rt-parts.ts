'use client'

import { useMemo, useState } from 'react'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'

/** Manages checked-parts state for the VFR RT practice setup form. */
export function useVfrRtParts(parts: TopicWithSubtopics[]) {
  const [checkedTopics, setCheckedTopics] = useState<Set<string>>(
    () => new Set(parts.map((p) => p.id)),
  )

  const totalQuestions = useMemo(
    () => parts.filter((p) => checkedTopics.has(p.id)).reduce((sum, p) => sum + p.questionCount, 0),
    [parts, checkedTopics],
  )

  const allSelected = parts.length > 0 && parts.every((p) => checkedTopics.has(p.id))

  function toggleTopic(topicId: string) {
    setCheckedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(topicId)) next.delete(topicId)
      else next.add(topicId)
      return next
    })
  }

  // RT parts are flat — subtopics are not expected. This no-op satisfies TopicTree's
  // onToggleSubtopic prop contract without adding dead state-management code.
  function toggleSubtopic(_subtopicId: string, _topicId: string) {}

  function selectAll() {
    if (allSelected) {
      setCheckedTopics(new Set())
    } else {
      setCheckedTopics(new Set(parts.map((p) => p.id)))
    }
  }

  return {
    checkedTopics,
    checkedSubtopics: new Set<string>(), // RT has no subtopics; always empty
    totalQuestions,
    allSelected,
    toggleTopic,
    toggleSubtopic,
    selectAll,
    selectedTopicIds: [...checkedTopics],
  }
}
