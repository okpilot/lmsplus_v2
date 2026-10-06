import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { UseQuizStartOpts } from '../session-types'
import { buildQuizStartHandler } from './quiz-start-handlers'
import { toBlockedStartState, useBlockedStart } from './use-blocked-start'

/**
 * Drives "Start quiz": the startQuizSession action and navigation to the session runner,
 * plus the blocked-start offer. The handler body lives in quiz-start-handlers.ts.
 */
export function useQuizStart(opts: UseQuizStartOpts) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blockedStart = useBlockedStart()
  // Synchronous one-shot re-entry guard (code-style §6): `loading` is async state,
  // so a same-tick double invocation (double-click, Enter + click) passes it twice.
  const inFlight = useRef(false)

  const handleStart = buildQuizStartHandler({
    ...opts,
    router,
    loading,
    setLoading,
    setError,
    setBlocked: blockedStart.setOffer,
    inFlight,
  })

  return {
    // Busy while the blocking quiz is being saved: a second start would no-op the offer's re-run.
    loading: loading || blockedStart.saving,
    error,
    handleStart,
    blocked: toBlockedStartState(blockedStart, handleStart),
  }
}
