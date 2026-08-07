import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { UseStudyStartOpts } from '../session-types'
import { buildStudyStartHandler } from './study-start-handlers'

/**
 * Drives "Start discovery". Mirrors use-quiz-start: navigates to /app/quiz/session
 * and reuses the real session runner. Fetches the MC-only pool, writes the
 * pre-marked handoff, then pushes. Empty/error → inline message, no navigation.
 * The handler body lives in study-start-handlers.ts.
 */
export function useStudyStart(opts: UseStudyStartOpts) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot re-entry guard (code-style §6): `loading` is async state,
  // so a same-tick double invocation (double-click, Enter + click) passes it twice.
  const inFlight = useRef(false)

  const handleStart = buildStudyStartHandler({
    ...opts,
    router,
    loading,
    setLoading,
    setError,
    inFlight,
  })

  return { loading, error, handleStart }
}
