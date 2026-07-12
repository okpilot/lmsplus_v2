import type { useRouter } from 'next/navigation'
import { clearDeploymentPin } from '../actions/clear-deployment-pin'
import { discardQuiz } from '../actions/discard'
import { saveDraft } from '../actions/draft'
import { sessionHandoffKey } from '../session/_utils/quiz-session-handoff'
import {
  type ActiveSession,
  buildHandoffPayload,
  clearActiveSession,
} from '../session/_utils/quiz-session-storage'

type AppRouterInstance = ReturnType<typeof useRouter>

type SetState<T> = (v: T) => void

export function buildResumeHandler(
  userId: string,
  session: ActiveSession | null,
  setError: SetState<string | null>,
  router: AppRouterInstance,
) {
  return function handleResume() {
    if (!session) return
    try {
      sessionStorage.setItem(
        sessionHandoffKey(userId),
        JSON.stringify(buildHandoffPayload(userId, session)),
      )
    } catch (err) {
      console.warn('[quiz-recovery-banner] Resume handoff failed:', err)
      setError('Unable to resume right now. Please try again.')
      return
    }
    clearActiveSession(userId)
    router.push('/app/quiz/session')
  }
}

export function buildSaveHandler(
  userId: string,
  session: ActiveSession | null,
  inFlightRef: React.RefObject<boolean>,
  setLoading: SetState<boolean>,
  setError: SetState<string | null>,
  setSession: SetState<ActiveSession | null>,
  router: AppRouterInstance,
) {
  return async function handleSave() {
    // Synchronous one-shot re-entry guard (code-style §6). The ref is shared with
    // buildDiscardHandler, preserving the old shared-`loading` semantics but without
    // the async-state race (`loading` is now UI-only).
    if (inFlightRef.current || !session) return
    inFlightRef.current = true // set before the first await
    setLoading(true)
    setError(null)
    try {
      const { sessionId, questionIds, answers, feedback, currentIndex } = session
      const result = await saveDraft({
        draftId: session.draftId,
        sessionId,
        questionIds,
        answers,
        feedback,
        currentIndex,
        subjectName: session.subjectName,
        subjectCode: session.subjectCode,
      })
      if (result.success) {
        clearActiveSession(userId)
        // router.refresh() is non-terminal (user stays in place) — exempt from the
        // await-before-terminal-nav rule (code-style.md §6).
        clearDeploymentPin().catch(() => {})
        router.refresh()
        // Terminal success: setSession(null) dismisses the recovery banner, so the
        // in-flight ref intentionally stays set — a late duplicate cannot re-fire, and
        // the `!session` guard above makes both handlers inert anyway (code-style §6).
        setSession(null)
      } else {
        setError(result.error ?? 'Failed to save. Please try again.')
        inFlightRef.current = false // retryable failure — release the lock
      }
    } catch {
      setError('Server unavailable. Please try again later.')
      inFlightRef.current = false // retryable failure — release the lock
    } finally {
      setLoading(false)
    }
  }
}

export function buildDiscardHandler(
  userId: string,
  session: ActiveSession | null,
  inFlightRef: React.RefObject<boolean>,
  setSession: SetState<ActiveSession | null>,
) {
  return function handleDiscard() {
    // Synchronous check-and-set one-shot (code-style §6). This handler is sync
    // fire-and-forget (discardQuiz is never awaited) and terminal — setSession(null)
    // ends the recovery UI — so the ref is never reset. The shared ref also blocks
    // a discard while a save is still in flight (old shared-`loading` semantics).
    if (inFlightRef.current) return
    inFlightRef.current = true
    clearActiveSession(userId)
    // No terminal navigation in this handler at all (the parent component navigates), so the
    // await-before-terminal-nav rule (code-style.md §6) does not apply here.
    clearDeploymentPin().catch(() => {})
    if (session)
      discardQuiz({ sessionId: session.sessionId, draftId: session.draftId }).catch(() => {})
    setSession(null)
  }
}
