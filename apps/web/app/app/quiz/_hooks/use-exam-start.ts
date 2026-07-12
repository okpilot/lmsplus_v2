import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { buildExamStartHandler, type UseExamStartOpts } from './exam-start-handlers'

/**
 * Drives "Start Practice Exam": confirm-overwrite of an unfinished session, the
 * startExamSession action, the sessionStorage handoff (with orphan cleanup on a
 * failed write), and navigation to the session runner. The handler body lives in
 * exam-start-handlers.ts.
 */
export function useExamStart(opts: UseExamStartOpts) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot re-entry guard (code-style §6): `loading` is async state,
  // so a same-tick double invocation (double-click, Enter + click) passes it twice.
  const inFlight = useRef(false)

  const handleStart = buildExamStartHandler({
    ...opts,
    router,
    loading,
    setLoading,
    setError,
    inFlight,
  })

  return { loading, error, handleStart }
}
