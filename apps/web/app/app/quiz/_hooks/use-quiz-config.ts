import type { SubjectOption, SubtopicOption, TopicOption } from '@/lib/queries/quiz'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { QuestionFilter } from '../_components/question-filters'
import { fetchSubtopicsForTopic, fetchTopicsForSubject } from '../actions/lookup'
import { startQuizSession } from '../actions/start'

function useQuizCascade() {
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

export function useQuizConfig({ subjects }: { subjects: SubjectOption[] }) {
  const router = useRouter()
  const cascade = useQuizCascade()
  const [filter, setFilter] = useState<QuestionFilter>('all')
  const [count, setCount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { subjectId, topicId, subtopicId, topics, subtopics } = cascade
  const availableCount = subtopicId
    ? (subtopics.find((st) => st.id === subtopicId)?.questionCount ?? 0)
    : topicId
      ? (topics.find((t) => t.id === topicId)?.questionCount ?? 0)
      : (subjects.find((s) => s.id === subjectId)?.questionCount ?? 0)
  const maxQuestions = Math.min(availableCount, 50)

  async function handleStart() {
    if (!subjectId) return
    setLoading(true)
    setError(null)
    try {
      const result = await startQuizSession({
        subjectId,
        topicId: topicId || null,
        subtopicId: subtopicId || null,
        count: Math.min(count, maxQuestions || 1),
        filter,
      })
      if (result.success) {
        sessionStorage.setItem(
          'quiz-session',
          JSON.stringify({ sessionId: result.sessionId, questionIds: result.questionIds }),
        )
        router.push('/app/quiz/session')
        return
      }
      setError(result.error)
      setLoading(false)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }
  return {
    ...cascade,
    filter,
    setFilter,
    count,
    setCount,
    loading,
    error,
    maxQuestions,
    handleStart,
  }
}
