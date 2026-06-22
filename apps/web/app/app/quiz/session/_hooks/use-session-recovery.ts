import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { clearDeploymentPin } from '../../actions/clear-deployment-pin'
import { discardQuiz } from '../../actions/discard'
import { saveDraft } from '../../actions/draft'
import { type ActiveSession, clearActiveSession } from '../_utils/quiz-session-storage'

export function useSessionRecovery(recovery: ActiveSession | null, userId: string) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (loading || !recovery) return
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
        clearDeploymentPin().catch(() => {})
        setLoading(false)
        router.replace('/app/quiz')
      } else {
        setError(result.error ?? 'Failed to save. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Server unavailable. Please try again later.')
      setLoading(false)
    }
  }

  async function handleDiscard() {
    if (loading) return
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
