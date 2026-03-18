import { useRef, useState, useTransition } from 'react'
import type { TopicWithSubtopics } from '@/lib/queries/quiz'
import { fetchTopicsWithSubtopics } from '../actions/lookup'
import { calcSelectedCount } from './topic-tree-helpers'

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
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return
    const adding = !checkedTopics.has(topicId)
    setCheckedTopics((prev) => {
      const n = new Set(prev)
      adding ? n.add(topicId) : n.delete(topicId)
      return n
    })
    setCheckedSubtopics((prev) => {
      const n = new Set(prev)
      for (const st of topic.subtopics) adding ? n.add(st.id) : n.delete(st.id)
      return n
    })
  }

  function toggleSubtopic(subtopicId: string, topicId: string) {
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return
    setCheckedSubtopics((prev) => {
      const n = new Set(prev)
      n.has(subtopicId) ? n.delete(subtopicId) : n.add(subtopicId)
      const allChecked = topic.subtopics.every((st) => n.has(st.id))
      setCheckedTopics((tp) => {
        const nt = new Set(tp)
        allChecked ? nt.add(topicId) : nt.delete(topicId)
        return nt
      })
      return n
    })
  }

  function selectAll() {
    if (allSelected) {
      setCheckedTopics(new Set())
      setCheckedSubtopics(new Set())
    } else {
      setCheckedTopics(new Set(topics.map((t) => t.id)))
      setCheckedSubtopics(new Set(topics.flatMap((t) => t.subtopics.map((st) => st.id))))
    }
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
