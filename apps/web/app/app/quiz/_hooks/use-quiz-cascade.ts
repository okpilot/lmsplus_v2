import type { SubtopicOption, TopicOption } from '@/lib/queries/quiz'
import { useState, useTransition } from 'react'
import { fetchSubtopicsForTopic, fetchTopicsForSubject } from '../actions/lookup'

export function useQuizCascade() {
  const [subjectId, setSubjectId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [subtopicId, setSubtopicId] = useState('')
  const [topics, setTopics] = useState<TopicOption[]>([])
  const [subtopics, setSubtopics] = useState<SubtopicOption[]>([])
  const [isPending, startTransition] = useTransition()

  function handleSubjectChange(newSubjectId: string) {
    setSubjectId(newSubjectId)
    setTopicId('')
    setSubtopicId('')
    setTopics([])
    setSubtopics([])
    if (newSubjectId) {
      startTransition(async () => setTopics(await fetchTopicsForSubject(newSubjectId)))
    }
  }

  function handleTopicChange(newTopicId: string) {
    setTopicId(newTopicId)
    setSubtopicId('')
    setSubtopics([])
    if (newTopicId) {
      startTransition(async () => setSubtopics(await fetchSubtopicsForTopic(newTopicId)))
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
