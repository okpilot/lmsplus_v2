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
  loading: boolean,
  setLoading: SetState<boolean>,
  setError: SetState<string | null>,
  setSession: SetState<ActiveSession | null>,
  router: AppRouterInstance,
) {
  return async function handleSave() {
    if (loading || !session) return
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
        setSession(null)
      } else {
        setError(result.error ?? 'Failed to save. Please try again.')
      }
    } catch {
      setError('Server unavailable. Please try again later.')
    } finally {
      setLoading(false)
    }
  }
}

export function buildDiscardHandler(
  userId: string,
  session: ActiveSession | null,
  loading: boolean,
  setSession: SetState<ActiveSession | null>,
) {
  return function handleDiscard() {
    if (loading) return
    clearActiveSession(userId)
    // No terminal navigation in this handler at all (the parent component navigates), so the
    // await-before-terminal-nav rule (code-style.md §6) does not apply here.
    clearDeploymentPin().catch(() => {})
    if (session)
      discardQuiz({ sessionId: session.sessionId, draftId: session.draftId }).catch(() => {})
    setSession(null)
  }
}
