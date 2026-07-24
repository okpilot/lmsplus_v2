import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { clearDeploymentPin } from '../../actions/clear-deployment-pin'
import { discardQuiz } from '../../actions/discard'
import { saveDraft } from '../../actions/draft'
import { type ActiveSession, clearActiveSession } from '../_utils/quiz-session-storage'

export function useSessionRecovery(recovery: ActiveSession | null, userId: string) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot re-entry guard SHARED by save + discard (code-style §6),
  // mirroring the old shared-`loading` semantics without the async-state race.
  // `loading` stays as async React state for the UI only.
  const inFlightRef = useRef(false)

  async function handleSave() {
    if (inFlightRef.current || !recovery) return
    inFlightRef.current = true // set before the first await
    setLoading(true)
    setError(null)
    try {
      const result = await saveDraft({
        draftId: recovery.draftId,
        sessionId: recovery.sessionId,
        questionIds: recovery.questionIds,
        answers: recovery.answers,
        feedback: recovery.feedback,
        currentIndex: recovery.currentIndex,
        subjectName: recovery.subjectName,
        subjectCode: recovery.subjectCode,
      })
      if (result.success) {
        clearActiveSession(userId)
        // Non-critical cleanup fired before the terminal nav; setLoading is a sync state
        // update, so router.replace stays the last statement (code-style.md §6).
        // Terminal: navigating away — the in-flight ref intentionally stays set.
        clearDeploymentPin().catch(() => {})
        setLoading(false)
        router.replace('/app/quiz')
      } else {
        setError(result.error ?? 'Failed to save. Please try again.')
        inFlightRef.current = false // retryable failure — release the lock
        setLoading(false)
      }
    } catch {
      setError('Server unavailable. Please try again later.')
      inFlightRef.current = false // retryable failure — release the lock
      setLoading(false)
    }
  }

  async function handleDiscard() {
    // One-shot: ends in router.replace (terminal), so the ref is never reset (§6).
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    const captured = recovery
    clearActiveSession(userId)
    // Non-critical cleanup: fire before the terminal nav (code-style.md §6).
    clearDeploymentPin().catch(() => {})
    // Critical: await the discard before navigating — a Server Action fired AFTER
    // router.replace can cancel the soft-nav and strand the user (#568/#909; sweep #941).
    if (captured) {
      await discardQuiz({ sessionId: captured.sessionId, draftId: captured.draftId }).catch(
        () => {},
      )
    }
    router.replace('/app/quiz')
  }

  return { loading, error, handleSave, handleDiscard }
}
