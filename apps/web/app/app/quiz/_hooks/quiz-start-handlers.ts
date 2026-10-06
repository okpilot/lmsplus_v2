import type { useRouter } from 'next/navigation'
import { startQuizSession } from '../actions/start'
import type { UseQuizStartOpts } from '../session-types'
import { type BlockedOffer, failStart, reportStartFailure } from './start-handler-shared'

type AppRouterInstance = ReturnType<typeof useRouter>

export type QuizStartDeps = UseQuizStartOpts & {
  router: AppRouterInstance
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  setBlocked: (offer: BlockedOffer | null) => void
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

export function buildQuizStartHandler(deps: QuizStartDeps) {
  return async function handleStart() {
    if (deps.inFlight.current || deps.loading || !deps.subjectId) return
    deps.inFlight.current = true
    deps.setLoading(true)
    deps.setError(null)
    deps.setBlocked(null)
    try {
      const result = await startQuizSession(buildStartQuizPayload(deps))
      if (!result.success) return await reportStartFailure(deps, result)
      // Terminal success: the lock stays engaged while router.push unmounts the form.
      deps.router.push(`/app/quiz/session/${result.sessionId}`)
    } catch {
      failStart(deps, 'Something went wrong. Please try again.')
    }
  }
}
