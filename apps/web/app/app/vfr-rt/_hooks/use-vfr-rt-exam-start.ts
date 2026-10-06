import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { toBlockedStartState, useBlockedStart } from '@/app/app/quiz/_hooks/use-blocked-start'
import {
  buildVfrRtExamStartHandler,
  type UseVfrRtExamStartOpts,
} from './vfr-rt-exam-start-handlers'

/**
 * Drives "Start VFR RT Mock Exam": the startVfrRtExam action and navigation to the shared
 * session runner, plus the blocked-start offer. The handler body lives in
 * vfr-rt-exam-start-handlers.ts.
 */
export function useVfrRtExamStart(opts: UseVfrRtExamStartOpts) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blockedStart = useBlockedStart()
  // Synchronous one-shot re-entry guard (code-style §6); `loading` is async state.
  const inFlight = useRef(false)

  const handleStart = buildVfrRtExamStartHandler({
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
