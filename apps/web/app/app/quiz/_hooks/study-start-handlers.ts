import type { useRouter } from 'next/navigation'
import { endDiscovery } from '../actions/end-discovery'
import { startStudy } from '../actions/study'
import { sessionHandoffKey } from '../session/_utils/quiz-session-handoff'
import type { UseStudyStartOpts } from '../session-types'
import { buildDiscoveryHandoff } from './build-discovery-handoff'
import { failStart } from './start-handler-shared'

type AppRouterInstance = ReturnType<typeof useRouter>

export type StudyStartDeps = UseStudyStartOpts & {
  router: AppRouterInstance
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  inFlight: React.RefObject<boolean>
}

function buildStartStudyPayload(deps: StudyStartDeps) {
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
 * Write the pre-marked discovery handoff to sessionStorage. Returns false on a
 * storage failure (private-mode SecurityError, quota) so the caller surfaces a
 * message instead of navigating to an empty session.
 */
function writeDiscoveryHandoff(
  deps: StudyStartDeps,
  questions: Parameters<typeof buildDiscoveryHandoff>[0],
): boolean {
  const subject = deps.subjects.find((s) => s.id === deps.subjectId)
  try {
    sessionStorage.setItem(
      sessionHandoffKey(deps.userId),
      JSON.stringify(
        buildDiscoveryHandoff(questions, {
          userId: deps.userId,
          subjectName: subject?.name,
          subjectCode: subject?.short,
        }),
      ),
    )
    return true
  } catch (err) {
    console.warn('[use-study-start] sessionStorage handoff failed:', err)
    return false
  }
}

/**
 * startStudy already created a server-side discovery row, but its result carries
 * no sessionId, so scoped cleanup is impossible — blanket-clear the caller's
 * active discovery rows instead. That is safe here: the user is starting
 * discovery, and endDiscovery's own doc names startStudy-failure teardown as a
 * purpose. An orphaned active session would otherwise block the retry under the
 * single-active-session invariant (#1011). Never throws — a cleanup failure must
 * not swallow the caller's user-facing handoff error.
 */
async function endOrphanDiscovery(): Promise<void> {
  try {
    const cleanup = await endDiscovery()
    if (!cleanup.success) {
      console.error('[use-study-start] orphan cleanup failed:', cleanup.error)
    }
  } catch (cleanupErr) {
    console.error('[use-study-start] orphan cleanup threw:', cleanupErr)
  }
}

export function buildStudyStartHandler(deps: StudyStartDeps) {
  return async function handleStart() {
    if (deps.inFlight.current || deps.loading || !deps.subjectId) return
    // No confirm dialog on the discovery path — lock right after the validation
    // early-return (code-style §6); a same-tick second invocation bails above.
    deps.inFlight.current = true
    deps.setLoading(true)
    deps.setError(null)
    try {
      const result = await startStudy(buildStartStudyPayload(deps))
      // result.error keeps the action's mapped message inline (e.g. active-exam deny).
      if (!result.success) return failStart(deps, result.error)
      if (result.questions.length === 0) {
        return failStart(deps, 'No questions match these filters.')
      }
      if (!writeDiscoveryHandoff(deps, result.questions)) {
        await endOrphanDiscovery()
        return failStart(deps, 'Unable to start discovery right now. Please try again.')
      }
      // Terminal success: the lock stays engaged while router.push unmounts the form.
      deps.router.push('/app/quiz/session')
    } catch {
      failStart(deps, 'Something went wrong. Please try again.')
    }
  }
}
