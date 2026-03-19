import { useRef, useState, useTransition } from 'react'
import type { TopicWithSubtopics } from '@/lib/queries/quiz'
import { fetchTopicsWithSubtopics } from '../actions/lookup'
import {
  calcSelectedCount,
  computeSelectAll,
  computeToggleSubtopic,
  computeToggleTopic,
} from './topic-tree-helpers'

export type { UseTopicTreeReturn } from './topic-tree-helpers'

export function useTopicTree() {
  const [topics, setTopics] = useState<TopicWithSubtopics[]>([])
  const [checkedTopics, setCheckedTopics] = useState<Set<string>>(new Set())
  const [checkedSubtopics, setCheckedSubtopics] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const generation = useRef(0)

  const totalQuestions = topics.reduce((sum, t) => sum + t.questionCount, 0)
  const selectedQuestionCount = calcSelectedCount(topics, checkedTopics, checkedSubtopics)
  const allSelected =
    topics.length > 0 &&
    topics.every(
      (t) => checkedTopics.has(t.id) && t.subtopics.every((st) => checkedSubtopics.has(st.id)),
    )

  function loadTopics(subjectId: string) {
    generation.current++
    const gen = generation.current
    startTransition(async () => {
      const result = await fetchTopicsWithSubtopics(subjectId)
      if (gen !== generation.current) return
      setTopics(result)
      setCheckedTopics(new Set(result.map((t) => t.id)))
      setCheckedSubtopics(new Set(result.flatMap((t) => t.subtopics.map((st) => st.id))))
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
