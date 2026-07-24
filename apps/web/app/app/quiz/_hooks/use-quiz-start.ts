import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { UseQuizStartOpts } from '../session-types'
import { buildQuizStartHandler } from './quiz-start-handlers'

/**
 * Drives "Start quiz": confirm-overwrite of an unfinished session, the
 * startQuizSession action, the sessionStorage handoff, and navigation to the
 * session runner. The handler body lives in quiz-start-handlers.ts.
 */
export function useQuizStart(opts: UseQuizStartOpts) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot re-entry guard (code-style §6): `loading` is async state,
  // so a same-tick double invocation (double-click, Enter + click) passes it twice.
  const inFlight = useRef(false)

  const handleStart = buildQuizStartHandler({
    ...opts,
    router,
    loading,
    setLoading,
    setError,
    inFlight,
  })

  return { loading, error, handleStart }
}
