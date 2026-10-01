import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import {
  buildVfrRtExamStartHandler,
  type UseVfrRtExamStartOpts,
} from './vfr-rt-exam-start-handlers'

/**
 * Drives "Start VFR RT Mock Exam": confirm-overwrite of an unrelated unfinished session,
 * the startVfrRtExam action, the sessionStorage handoff, and navigation to the shared
 * session runner. The handler body lives in vfr-rt-exam-start-handlers.ts.
 */
export function useVfrRtExamStart(opts: UseVfrRtExamStartOpts) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot re-entry guard (code-style §6); `loading` is async state.
  const inFlight = useRef(false)

  const handleStart = buildVfrRtExamStartHandler({
    ...opts,
    router,
    loading,
    setLoading,
    setError,
    inFlight,
  })

  return { loading, error, handleStart }
}
