import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { reportStartFailure } from '@/app/app/quiz/_hooks/start-handler-shared'
import { toBlockedStartState, useBlockedStart } from '@/app/app/quiz/_hooks/use-blocked-start'
import { startInternalExam } from '../actions/start-internal-exam'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

type BlockedStart = ReturnType<typeof useBlockedStart>

/** Runs the start under a synchronous one-shot lock (code-style §6): `isPending` is async state. */
function useStartRunner(code: string, setError: (m: string | null) => void, blocked: BlockedStart) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const startedRef = useRef(false)
  const fail = (result: { error: string; blocked?: true }) =>
    reportStartFailure(
      { setLoading: () => {}, setError, setBlocked: blocked.setOffer, inFlight: startedRef },
      result,
    )
  function start() {
    if (startedRef.current) return
    startedRef.current = true
    setError(null)
    blocked.setOffer(null)
    startTransition(async () => {
      try {
        const result = await startInternalExam({ code })
        // Terminal success: the lock stays engaged while the page navigates away.
        if (result.success) return router.push(`/app/quiz/session/${result.sessionId}`)
        await fail(result)
      } catch {
        startedRef.current = false
        setError(GENERIC_ERROR)
      }
    })
  }
  return { isPending, start }
}

/**
 * Starts an internal exam from a validated code and opens `/app/quiz/session/<id>`. A start
 * blocked by an open practice quiz carries the "save it for later and start" offer.
 */
export function useCodeEntryStart(code: string) {
  const [error, setError] = useState<string | null>(null)
  const blockedStart = useBlockedStart()
  const { isPending, start } = useStartRunner(code, setError, blockedStart)

  function reset() {
    setError(null)
    blockedStart.setOffer(null)
  }

  return {
    error,
    setError,
    isPending,
    start,
    reset,
    blocked: toBlockedStartState(blockedStart, start),
  }
}
