import { useRef, useState, useTransition } from 'react'
import type { SubtopicOption, TopicOption } from '@/lib/queries/quiz'
import { fetchSubtopicsForTopic, fetchTopicsForSubject } from '../actions/lookup'

export function useQuizCascade() {
  const [subjectId, setSubjectId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [subtopicId, setSubtopicId] = useState('')
  const [topics, setTopics] = useState<TopicOption[]>([])
  const [subtopics, setSubtopics] = useState<SubtopicOption[]>([])
  const [isPending, startTransition] = useTransition()
  const generation = useRef(0)

  function handleSubjectChange(newSubjectId: string) {
    generation.current++
    setSubjectId(newSubjectId)
    setTopicId('')
    setSubtopicId('')
    setTopics([])
    setSubtopics([])
    if (newSubjectId) {
      const gen = generation.current
      startTransition(async () => {
        const result = await fetchTopicsForSubject(newSubjectId)
        if (gen === generation.current) setTopics(result)
      })
    }
  }

  function handleTopicChange(newTopicId: string) {
    generation.current++
    setTopicId(newTopicId)
    setSubtopicId('')
    setSubtopics([])
    if (newTopicId) {
      const gen = generation.current
      startTransition(async () => {
        const result = await fetchSubtopicsForTopic(newTopicId)
        if (gen === generation.current) setSubtopics(result)
      })
    }
  }

  return {
    subjectId,
    topicId,
    subtopicId,
    setSubtopicId,
    topics,
    subtopics,
    isPending,
    handleSubjectChange,
    handleTopicChange,
  }
}
