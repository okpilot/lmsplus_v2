import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { startStudy } from '../actions/study'
import { sessionHandoffKey } from '../session/_utils/quiz-session-handoff'
import type { UseStudyStartOpts } from '../session-types'
import { buildDiscoveryHandoff } from './build-discovery-handoff'

/**
 * Write the pre-marked discovery handoff to sessionStorage. Returns false on a
 * storage failure (private-mode SecurityError, quota) so the caller surfaces a
 * message instead of navigating to an empty session.
 */
function writeDiscoveryHandoff(
  userId: string,
  questions: Parameters<typeof buildDiscoveryHandoff>[0],
  subjectName?: string,
  subjectCode?: string,
): boolean {
  try {
    sessionStorage.setItem(
      sessionHandoffKey(userId),
      JSON.stringify(buildDiscoveryHandoff(questions, { userId, subjectName, subjectCode })),
    )
    return true
  } catch (err) {
    console.warn('[use-study-start] sessionStorage handoff failed:', err)
    return false
  }
}

/**
 * Drives "Start discovery". Mirrors use-quiz-start: navigates to /app/quiz/session
 * and reuses the real session runner. Fetches the MC-only pool, writes the
 * pre-marked handoff, then pushes. Empty/error → inline message, no navigation.
 */
export function useStudyStart(opts: UseStudyStartOpts) {
  const { userId, subjectId, subjects, count, maxQuestions, filters, calcMode, imageMode } = opts
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fail(message: string) {
    setError(message)
    setLoading(false)
  }

  async function handleStart() {
    if (loading || !subjectId) return
    setLoading(true)
    setError(null)
    try {
      const topicIds = opts.topicTree.getSelectedTopicIds()
      const subtopicIds = opts.topicTree.getSelectedSubtopicIds()
      const result = await startStudy({
        subjectId,
        topicIds: topicIds.length > 0 ? topicIds : undefined,
        subtopicIds: subtopicIds.length > 0 ? subtopicIds : undefined,
        count: Math.min(count, maxQuestions || 1),
        filters,
        calcMode,
        imageMode,
      })
      // result.error keeps the action's mapped message inline (e.g. active-exam deny).
      if (!result.success) return fail(result.error)
      if (result.questions.length === 0) return fail('No questions match these filters.')
      const subject = subjects.find((s) => s.id === subjectId)
      if (!writeDiscoveryHandoff(userId, result.questions, subject?.name, subject?.short)) {
        return fail('Unable to start discovery right now. Please try again.')
      }
      router.push('/app/quiz/session')
    } catch {
      fail('Something went wrong. Please try again.')
    }
  }

  return { loading, error, handleStart }
}
