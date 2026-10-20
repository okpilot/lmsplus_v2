import type { useRouter } from 'next/navigation'
import { endDiscovery } from '../actions/end-discovery'
import { type StartStudyResult, startStudy } from '../actions/study'
import { setDiscoveryPrefetch } from '../session/_utils/discovery-prefetch'
import { sessionHandoffKey } from '../session/_utils/quiz-session-handoff'
import type { UseStudyStartOpts } from '../session-types'
import { buildDiscoveryHandoff, type DiscoveryHandoff } from './build-discovery-handoff'
import { failStart } from './start-handler-shared'
import { toSessionQuestion } from './study-to-session-question'

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
 * Write the pre-marked discovery handoff to sessionStorage. Returns the handoff, or
 * null on a storage failure (private-mode SecurityError, quota) so the caller
 * surfaces a message instead of navigating to an empty session.
 */
function writeDiscoveryHandoff(
  deps: StudyStartDeps,
  questions: Parameters<typeof buildDiscoveryHandoff>[0],
): DiscoveryHandoff | null {
  const subject = deps.subjects.find((s) => s.id === deps.subjectId)
  try {
    const handoff = buildDiscoveryHandoff(questions, {
      userId: deps.userId,
      subjectName: subject?.name,
      subjectCode: subject?.short,
    })
    sessionStorage.setItem(sessionHandoffKey(deps.userId), JSON.stringify(handoff))
    return handoff
  } catch (err) {
    console.warn('[use-study-start] sessionStorage handoff failed:', err)
    return null
  }
}

/**
 * startStudy already created a server-side discovery row and returned its id in
 * `result.sessionId` — scope teardown to that one row instead of blanket-clearing
 * every active discovery row for the caller. A blanket clear from this tab could
 * tombstone a NEWER discovery row a second tab created for the same user in the
 * meantime (cross-tab TOCTOU race against the single-active-session invariant,
 * #1011) — the same reasoning `startStudy`'s own server-side teardown already
 * follows. This teardown is best-effort hygiene, NOT a prerequisite for anything:
 * every start RPC (migs 137/141/138/139/140) unconditionally soft-deletes the
 * caller's active discovery rows before evaluating its single-active guard, and
 * start_discovery (mig 20261020000100) excludes discovery rows from its guard and
 * soft-deletes them before its INSERT, so an orphaned row blocks no retry — and no surface reads it either (get-active-practice-
 * session filters to quick_quiz/smart_review), so it raises no stale resume prompt.
 * It is cleared to keep the table honest, nothing more. Never throws — a cleanup failure must not swallow the
 * caller's user-facing handoff error. If sessionId is missing (should not happen
 * once questions were returned — startStudy rejects a payload without one), skip cleanup rather than fall back
 * to a blanket clear that would hit a different tab's session on ANY payload.
 *
 * start_discovery has no replay branch, so the id is this request's own row.
 */
async function endOrphanDiscovery(sessionId: string | undefined): Promise<void> {
  if (!sessionId) {
    console.error('[use-study-start] orphan cleanup skipped: no sessionId in startStudy result')
    return
  }
  try {
    const cleanup = await endDiscovery({ sessionId })
    if (!cleanup.success) {
      console.error('[use-study-start] orphan cleanup failed for session', sessionId, cleanup.error)
    }
  } catch (cleanupErr) {
    console.error('[use-study-start] orphan cleanup threw for session', sessionId, cleanupErr)
  }
}

/** Hands the started questions and flags to the session page for the soft navigation. */
function publishDiscoveryPrefetch(
  deps: StudyStartDeps,
  handoff: DiscoveryHandoff,
  result: Extract<StartStudyResult, { success: true }>,
) {
  setDiscoveryPrefetch({
    userId: deps.userId,
    sessionId: handoff.sessionId,
    questions: result.questions.map((q) => toSessionQuestion(q)),
    flaggedIds: result.flaggedIds,
  })
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
      const handoff = writeDiscoveryHandoff(deps, result.questions)
      if (!handoff) {
        await endOrphanDiscovery(result.sessionId)
        return failStart(deps, 'Unable to start discovery right now. Please try again.')
      }
      publishDiscoveryPrefetch(deps, handoff, result)
      // Terminal success: the lock stays engaged while router.push unmounts the form.
      deps.router.push('/app/quiz/session')
    } catch {
      failStart(deps, 'Something went wrong. Please try again.')
    }
  }
}
