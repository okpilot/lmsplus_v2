import type { useRouter } from 'next/navigation'
import { discardQuiz } from '../actions/discard'
import { clearActiveSessionIfCurrent } from '../session/_utils/quiz-session-storage'

type AppRouterInstance = ReturnType<typeof useRouter>

type SetState<T> = (v: T) => void

export type ResumeExamDeps = {
  userId: string
  activeSessionId: string
  router: AppRouterInstance
  setLoading: SetState<boolean>
  setError: SetState<string | null>
  setDiscarded: SetState<boolean>
  discardingRef: React.RefObject<boolean>
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
    // (mirrors discardQuizSession in quiz-submit.ts). Guarded on the id: this banner is
    // server-rendered and never revalidated, so a stale tab must not clear a legacy entry
    // naming a NEWER session.
    clearActiveSessionIfCurrent(deps.userId, deps.activeSessionId)
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
