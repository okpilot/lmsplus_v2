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
    if (!recovery) return
    setLoading(true)
    setError(null)
    try {
      const result = await saveDraft({
        draftId: recovery.draftId,
        sessionId: recovery.sessionId,
        questionIds: recovery.questionIds,
        answers: recovery.answers,
        currentIndex: recovery.currentIndex,
        subjectName: recovery.subjectName,
        subjectCode: recovery.subjectCode,
      })
      if (result.success) {
        clearActiveSession(userId)
        clearDeploymentPin().catch(() => {})
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

  function handleDiscard() {
    const captured = recovery
    clearActiveSession(userId)
    clearDeploymentPin().catch(() => {})
    router.replace('/app/quiz')
    if (captured) {
      discardQuiz({ sessionId: captured.sessionId }).catch(() => {})
    }
  }

  return { loading, error, handleSave, handleDiscard }
}
