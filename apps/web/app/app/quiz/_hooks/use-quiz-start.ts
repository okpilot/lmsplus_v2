import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { SubjectOption } from '@/lib/queries/quiz'
import { startQuizSession } from '../actions/start'
import type { QuestionFilterValue } from '../types'

type UseQuizStartOpts = {
  subjectId: string
  subjects: SubjectOption[]
  count: number
  maxQuestions: number
  filters: QuestionFilterValue[]
  topicTree: {
    getSelectedTopicIds: () => string[]
    getSelectedSubtopicIds: () => string[]
  }
}

export function useQuizStart(opts: UseQuizStartOpts) {
  const { subjectId, subjects, count, maxQuestions, filters, topicTree } = opts
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    if (!subjectId) return
    setLoading(true)
    setError(null)
    try {
      const topicIds = topicTree.getSelectedTopicIds()
      const subtopicIds = topicTree.getSelectedSubtopicIds()
      const effectiveCount = Math.min(count, maxQuestions || 1)
      const result = await startQuizSession({
        subjectId,
        topicIds: topicIds.length > 0 ? topicIds : undefined,
        subtopicIds: subtopicIds.length > 0 ? subtopicIds : undefined,
        count: effectiveCount,
        filters,
      })
      if (result.success) {
        const selectedSubject = subjects.find((s) => s.id === subjectId)
        sessionStorage.setItem(
          'quiz-session',
          JSON.stringify({
            sessionId: result.sessionId,
            questionIds: result.questionIds,
            subjectName: selectedSubject?.name,
            subjectCode: selectedSubject?.short,
          }),
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

  return { loading, error, handleStart }
}
