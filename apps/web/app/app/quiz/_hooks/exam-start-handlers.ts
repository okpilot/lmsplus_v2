import type { useRouter } from 'next/navigation'
import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import { discardQuiz } from '../actions/discard'
import { startExamSession } from '../actions/start-exam'
import { sessionHandoffKey } from '../session/_utils/quiz-session-handoff'
import { clearActiveSession, readActiveSession } from '../session/_utils/quiz-session-storage'
import { confirmStartOverwrite, failStart } from './start-handler-shared'

type AppRouterInstance = ReturnType<typeof useRouter>

export type UseExamStartOpts = {
  userId: string
  subjectId: string
  examSubjects: ExamSubjectOption[]
}

export type ExamStartDeps = UseExamStartOpts & {
  router: AppRouterInstance
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  inFlight: React.RefObject<boolean>
}

type ExamStartSuccess = {
  sessionId: string
  questionIds: string[]
  timeLimitSeconds: number
  passMark: number
  startedAt: string
}

/**
 * Persist the exam handoff. Returns false on a storage failure (private-mode
 * SecurityError, quota) so the caller surfaces a message instead of navigating
 * to an empty session.
 */
function writeExamHandoff(deps: ExamStartDeps, result: ExamStartSuccess): boolean {
  const subject = deps.examSubjects.find((s) => s.id === deps.subjectId)
  try {
    sessionStorage.setItem(
      sessionHandoffKey(deps.userId),
      JSON.stringify({
        userId: deps.userId,
        sessionId: result.sessionId,
        questionIds: result.questionIds,
        subjectName: subject?.name,
        subjectCode: subject?.short,
        mode: 'exam',
        timeLimitSeconds: result.timeLimitSeconds,
        passMark: result.passMark,
        startedAt: result.startedAt,
      }),
    )
    return true
  } catch (err) {
    console.warn('[use-exam-start] sessionStorage handoff failed:', err)
    return false
  }
}

/**
 * startExamSession already created a server-side exam. When the local handoff
 * write fails, soft-delete the orphan so the next attempt isn't blocked by
 * 'an exam session is already in progress for this subject'. Never throws —
 * a discard failure must not swallow the caller's user-facing handoff error.
 */
async function discardOrphanExam(sessionId: string): Promise<void> {
  try {
    const cleanup = await discardQuiz({ sessionId })
    if (!cleanup.success) {
      console.error('[use-exam-start] orphan discard failed for session', sessionId, cleanup.error)
    }
  } catch (cleanupErr) {
    console.error('[use-exam-start] orphan discard threw for session', sessionId, cleanupErr)
  }
}

export function buildExamStartHandler(deps: ExamStartDeps) {
  return async function handleStart() {
    if (deps.inFlight.current || deps.loading || !deps.subjectId) return
    const existing = readActiveSession(deps.userId)
    if (!confirmStartOverwrite(existing, 'an exam')) return
    // Lock AFTER the confirm/validation early-returns (code-style §6): a cancelled
    // confirm stays retryable; a same-tick second invocation bails on the check above.
    deps.inFlight.current = true
    deps.setLoading(true)
    deps.setError(null)
    try {
      const result = await startExamSession({ subjectId: deps.subjectId })
      if (!result.success) return failStart(deps, result.error)
      if (!writeExamHandoff(deps, result)) {
        await discardOrphanExam(result.sessionId)
        return failStart(deps, 'Unable to start Practice Exam right now. Please try again.')
      }
      if (existing) clearActiveSession(deps.userId)
      // Terminal success: the lock stays engaged while router.push unmounts the form.
      deps.router.push('/app/quiz/session')
    } catch {
      failStart(deps, 'Something went wrong. Please try again.')
    }
  }
}
