import { useState } from 'react'
import type { StudyQuestion } from '@/lib/queries/study-queries'
import { startStudy } from '../actions/study'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'

export type StartStudyInput = {
  subjectId: string
  topicIds?: string[]
  subtopicIds?: string[]
  count: number
  filters?: QuestionFilterValue[]
  calcMode?: CalcMode
  imageMode?: ImageMode
}

/**
 * Drives the "Start studying" action. Unlike use-quiz-start this does NOT
 * navigate — the study runner renders inline within the tab, so the loaded
 * questions live in component state. `questions === null` means "still in the
 * config form"; an empty array is a valid loaded result (no matches).
 */
export function useStudyStart() {
  const [questions, setQuestions] = useState<StudyQuestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start(input: StartStudyInput) {
    if (loading) return
    if (!input.subjectId) return
    setLoading(true)
    setError(null)
    try {
      const result = await startStudy(input)
      if (result.success) {
        setQuestions(result.questions)
      } else {
        setError(result.error)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setQuestions(null)
    setError(null)
  }

  return { questions, loading, error, start, reset }
}
