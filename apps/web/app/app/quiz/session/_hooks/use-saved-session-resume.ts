import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { discardSavedQuiz, resumeSavedQuiz } from '../../actions/saved-quiz'
import { getQuizDeviceId } from '../_utils/quiz-device-id'

const GENERIC = 'Something went wrong. Please try again.'

type Outcome = { success: true } | { success: false; error: string }

/** Runs one action at a time; a synchronous ref guards re-entry from a double click. */
function useGuardedRun() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function run(call: () => Promise<Outcome>, onDone: () => void) {
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

  return { loading, error, run }
}

/** Resume / delete of a saved quiz. */
export function useSavedSessionResume(sessionId: string) {
  const router = useRouter()
  const { loading, error, run } = useGuardedRun()

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
