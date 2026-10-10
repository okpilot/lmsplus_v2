import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { clearDeploymentPin } from '../actions/clear-deployment-pin'
import { isDisplayableProgressError } from '../actions/progress-error-messages'
import { discardSavedQuiz, resumeSavedQuiz } from '../actions/saved-quiz'
import { getQuizDeviceId } from '../session/_utils/quiz-device-id'

const RESUME_ERROR = 'Unable to resume right now. Please try again.'
const DISCARD_ERROR = 'Failed to delete. Please try again.'

type SetError = (message: string | null) => void

/** Resume reopens the saved session id; the synchronous ref stops a double click resuming twice. */
function useResume(sessionId: string, setError: SetError) {
  const router = useRouter()
  const [resuming, setResuming] = useState(false)
  const resumingRef = useRef(false)

  function fail(message: string) {
    setError(message)
    setResuming(false)
    resumingRef.current = false
  }

  async function resume() {
    if (resumingRef.current) return
    resumingRef.current = true
    setResuming(true)
    setError(null)
    try {
      const result = await resumeSavedQuiz({ sessionId, deviceId: getQuizDeviceId() })
      if (!result.success) {
        return fail(isDisplayableProgressError(result.error) ? result.error : RESUME_ERROR)
      }
    } catch {
      return fail(RESUME_ERROR)
    }
    await clearDeploymentPin().catch(() => {})
    // Terminal navigation is the last statement; ref intentionally NOT reset (success).
    router.push(`/app/quiz/session/${sessionId}`)
  }

  return { resuming, resume }
}

/** Delete clears the saved marker, then refreshes the list. */
function useDelete(sessionId: string, setError: SetError) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function remove() {
    if (!window.confirm('Delete this saved quiz? This cannot be undone.')) return
    setDeleting(true)
    setError(null)
    try {
      const result = await discardSavedQuiz({ sessionId })
      if (result.success) return router.refresh()
      setError(isDisplayableProgressError(result.error) ? result.error : DISCARD_ERROR)
    } catch {
      setError(DISCARD_ERROR)
    } finally {
      setDeleting(false)
    }
  }

  return { deleting, remove }
}

/** Resume and delete of one saved quiz card, sharing one error line. */
export function useSavedCardActions(sessionId: string) {
  const [error, setError] = useState<string | null>(null)
  const { resuming, resume } = useResume(sessionId, setError)
  const { deleting, remove } = useDelete(sessionId, setError)
  return { error, resuming, resume, deleting, remove }
}
