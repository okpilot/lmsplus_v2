import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { discardSavedQuiz, resumeSavedQuiz } from '../../actions/saved-quiz'
import { getQuizDeviceId } from '../_utils/quiz-device-id'

const GENERIC = 'Something went wrong. Please try again.'

/** Resume / delete of a saved quiz. A synchronous ref guards re-entry from a double click. */
export function useSavedSessionResume(sessionId: string) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function run(
    call: () => Promise<{ success: true } | { success: false; error: string }>,
    onDone: () => void,
  ) {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    setError(null)
    try {
      const r = await call()
      if (r.success) return onDone() // terminal: the lock stays so a late duplicate cannot re-fire
      setError(r.error)
    } catch {
      setError(GENERIC)
    }
    inFlight.current = false
    setLoading(false)
  }

  return {
    loading,
    error,
    resume: () =>
      run(
        () => resumeSavedQuiz({ sessionId, deviceId: getQuizDeviceId() }),
        () => router.refresh(),
      ),
    discard: () =>
      run(
        () => discardSavedQuiz({ sessionId }),
        () => router.push('/app/quiz'),
      ),
  }
}
