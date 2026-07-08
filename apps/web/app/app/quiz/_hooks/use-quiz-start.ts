import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { startQuizSession } from '../actions/start'
import { clearActiveSession, readActiveSession } from '../session/_utils/quiz-session-storage'
import type { UseQuizStartOpts } from '../session-types'
import { writeQuizSessionHandoff } from './write-quiz-session-handoff'

export function useQuizStart(opts: UseQuizStartOpts) {
  const {
    userId,
    subjectId,
    subjects,
    count,
    maxQuestions,
    filters,
    calcMode,
    imageMode,
    questionType,
    topicTree,
  } = opts
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    if (loading) return
    if (!subjectId) return
    const existing = readActiveSession(userId)
    if (existing) {
      const suffix = existing.subjectName ? ` (${existing.subjectName})` : ''
      const msg = `You have an unfinished quiz${suffix}. Starting a new quiz will lose it. Continue?`
      if (!globalThis.confirm(msg)) return
    }
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
        calcMode,
        imageMode,
        questionType,
      })
      if (result.success) {
        const selectedSubject = subjects.find((s) => s.id === subjectId)
        const wrote = writeQuizSessionHandoff(
          userId,
          result.sessionId,
          result.questionIds,
          selectedSubject?.name,
          selectedSubject?.short,
        )
        if (!wrote) {
          setError('Unable to start quiz right now. Please try again.')
          setLoading(false)
          return
        }
        if (existing) clearActiveSession(userId)
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
