import { useState } from 'react'
import type { StudyQuestion } from '@/lib/queries/study-queries'
import { startStudy } from '../actions/study'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'

type UseStudyStartOpts = {
  subjectId: string
  count: number
  maxQuestions: number
  filters?: QuestionFilterValue[]
  calcMode?: CalcMode
  imageMode?: ImageMode
  topicTree: {
    getSelectedTopicIds: () => string[]
    getSelectedSubtopicIds: () => string[]
  }
}

/**
 * Drives the "Start studying" action. Unlike use-quiz-start this does NOT
 * navigate — the study runner renders inline within the tab, so the loaded
 * questions live in component state. `questions === null` means "still in the
 * config form"; an empty array is a valid loaded result (no matches).
 */
export function useStudyStart(opts: UseStudyStartOpts) {
  const { subjectId, count, maxQuestions, filters, calcMode, imageMode, topicTree } = opts
  const [questions, setQuestions] = useState<StudyQuestion[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    if (loading) return
    if (!subjectId) return
    setLoading(true)
    setError(null)
    try {
      const topicIds = topicTree.getSelectedTopicIds()
      const subtopicIds = topicTree.getSelectedSubtopicIds()
      const effectiveCount = Math.min(count, maxQuestions || 1)
      const result = await startStudy({
        subjectId,
        topicIds: topicIds.length > 0 ? topicIds : undefined,
        subtopicIds: subtopicIds.length > 0 ? subtopicIds : undefined,
        count: effectiveCount,
        filters,
        calcMode,
        imageMode,
      })
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

  return { questions, loading, error, handleStart, reset }
}
