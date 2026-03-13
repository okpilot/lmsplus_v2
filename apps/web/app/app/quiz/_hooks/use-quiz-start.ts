import type { SubjectOption } from '@/lib/queries/quiz'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { QuestionFilter } from '../_components/question-filters'
import { startQuizSession } from '../actions/start'

type UseQuizStartOpts = {
  subjectId: string
  topicId: string
  subtopicId: string
  subjects: SubjectOption[]
  count: number
  maxQuestions: number
  filter: QuestionFilter
}

export function useQuizStart(opts: UseQuizStartOpts) {
  const { subjectId, topicId, subtopicId, subjects, count, maxQuestions, filter } = opts
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
