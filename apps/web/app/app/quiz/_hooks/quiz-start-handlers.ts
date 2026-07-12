import type { useRouter } from 'next/navigation'
import { startQuizSession } from '../actions/start'
import { sessionHandoffKey } from '../session/_utils/quiz-session-handoff'
import { clearActiveSession, readActiveSession } from '../session/_utils/quiz-session-storage'
import type { UseQuizStartOpts } from '../session-types'
import { confirmStartOverwrite, failStart } from './start-handler-shared'

type AppRouterInstance = ReturnType<typeof useRouter>

export type QuizStartDeps = UseQuizStartOpts & {
  router: AppRouterInstance
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  inFlight: React.RefObject<boolean>
}

function buildStartQuizPayload(deps: QuizStartDeps) {
  const topicIds = deps.topicTree.getSelectedTopicIds()
  const subtopicIds = deps.topicTree.getSelectedSubtopicIds()
  return {
    subjectId: deps.subjectId,
    topicIds: topicIds.length > 0 ? topicIds : undefined,
    subtopicIds: subtopicIds.length > 0 ? subtopicIds : undefined,
    count: Math.min(deps.count, deps.maxQuestions || 1),
    filters: deps.filters,
    calcMode: deps.calcMode,
    imageMode: deps.imageMode,
  }
}

/**
 * Persist the session handoff. Returns false on a storage failure (private-mode
 * SecurityError, quota) so the caller surfaces a message instead of navigating
 * to an empty session.
 */
function writeQuizHandoff(
  deps: QuizStartDeps,
  result: { sessionId: string; questionIds: string[] },
): boolean {
  const subject = deps.subjects.find((s) => s.id === deps.subjectId)
  try {
    sessionStorage.setItem(
      sessionHandoffKey(deps.userId),
      JSON.stringify({
        userId: deps.userId,
        sessionId: result.sessionId,
        questionIds: result.questionIds,
        subjectName: subject?.name,
        subjectCode: subject?.short,
      }),
    )
    return true
  } catch (err) {
    console.warn('[use-quiz-start] sessionStorage handoff failed:', err)
    return false
  }
}

export function buildQuizStartHandler(deps: QuizStartDeps) {
  return async function handleStart() {
    if (deps.inFlight.current || deps.loading || !deps.subjectId) return
    const existing = readActiveSession(deps.userId)
    if (!confirmStartOverwrite(existing, 'a new quiz')) return
    // Lock AFTER the confirm/validation early-returns (code-style §6): a cancelled
    // confirm stays retryable; a same-tick second invocation bails on the check above.
    deps.inFlight.current = true
    deps.setLoading(true)
    deps.setError(null)
    try {
      const result = await startQuizSession(buildStartQuizPayload(deps))
      if (!result.success) return failStart(deps, result.error)
      if (!writeQuizHandoff(deps, result)) {
        return failStart(deps, 'Unable to start quiz right now. Please try again.')
      }
      if (existing) clearActiveSession(deps.userId)
      // Terminal success: the lock stays engaged while router.push unmounts the form.
      deps.router.push('/app/quiz/session')
    } catch {
      failStart(deps, 'Something went wrong. Please try again.')
    }
  }
}
