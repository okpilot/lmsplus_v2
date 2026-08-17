import type { useRouter } from 'next/navigation'
import { discardQuiz } from '../actions/discard'
import type { ActiveExamSession } from '../actions/get-active-exam-session'
import { sessionHandoffKey } from '../session/_utils/quiz-session-handoff'
import { clearActiveSession, readActiveSession } from '../session/_utils/quiz-session-storage'

type AppRouterInstance = ReturnType<typeof useRouter>

type SetState<T> = (v: T) => void

export type ResumeExamDeps = {
  userId: string
  exam?: ActiveExamSession
  activeSessionId: string
  router: AppRouterInstance
  setLoading: SetState<boolean>
  setError: SetState<string | null>
  setDiscarded: SetState<boolean>
  discardingRef: React.RefObject<boolean>
}

export function buildResumeHandler(deps: ResumeExamDeps) {
  return function handleResume() {
    const { exam, userId } = deps
    if (!exam) return
    try {
      sessionStorage.setItem(
        sessionHandoffKey(userId),
        JSON.stringify({
          userId,
          sessionId: exam.sessionId,
          mode: 'exam',
          questionIds: exam.questionIds,
          timeLimitSeconds: exam.timeLimitSeconds,
          passMark: exam.passMark,
          subjectName: exam.subjectName,
          subjectCode: exam.subjectCode,
          startedAt: exam.startedAt,
        }),
      )
    } catch (err) {
      console.warn('[resume-exam-banner] Handoff write failed:', err)
      deps.setError('Unable to resume right now. Please try again.')
      return
    }
    deps.router.push('/app/quiz/session')
  }
}

export function buildDiscardHandler(deps: ResumeExamDeps) {
  return async function handleDiscard() {
    // Synchronous one-shot re-entry guard (code-style §6): `loading` is async React
    // state, so two same-tick triggers could both pass a loading check before it commits.
    if (deps.discardingRef.current) return
    deps.discardingRef.current = true // set before the first await (code-style §6)
    deps.setLoading(true)
    deps.setError(null)
    // Clear regardless of outcome — respect discard intent even when the Server Action fails
    // (mirrors quiz-submit.ts:68); a surviving key is what let a discarded session keep
    // offering Resume (#1190). Guarded on the id because this banner is server-rendered and
    // never revalidated, so a stale tab could otherwise wipe a NEWER session's answer buffer
    // — for a mock_exam that is a graded attempt. See the fuller note in
    // use-active-practice-discard.ts; rule 13 / mig 136 rules out concurrent sessions, not a
    // stale render. Until #1026 lands server-side checkpointing, a transient discard failure
    // still loses the local buffer for THIS session, which is the established repo trade.
    if (readActiveSession(deps.userId)?.sessionId === deps.activeSessionId) {
      clearActiveSession(deps.userId)
    }
    try {
      const result = await discardQuiz({ sessionId: deps.activeSessionId })
      if (result.success) {
        // Terminal success: `discarded` unmounts the banner, so the ref intentionally
        // stays set — a late duplicate trigger can never re-fire (code-style §6).
        deps.setDiscarded(true)
        deps.router.refresh()
        return
      }
      deps.setError(result.error ?? 'Failed to discard. Please try again.')
      deps.discardingRef.current = false // retryable failure — release the lock
    } catch {
      deps.setError('Server unavailable. Please try again later.')
      deps.discardingRef.current = false // retryable failure — release the lock
    } finally {
      deps.setLoading(false)
    }
  }
}
