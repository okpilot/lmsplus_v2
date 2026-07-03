'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { startOralExam } from '../actions/start-oral-exam'

export type UseOralExamStartResult = {
  starting: boolean
  error: string | null
  start: (mode: 'practice' | 'mock') => void
}

/**
 * Owns the ELP start workflow: guards re-entry synchronously (the real lock is the
 * `useRef` one-shot, not the `starting` state, which commits asynchronously and would
 * let the two Start buttons through before React disables them — code-style §6), calls
 * the start Server Action, and navigates to the new session on success. The ref is reset
 * only on the retryable failure/throw paths, never after the terminal `router.push`.
 */
export function useOralExamStart(): UseOralExamStartResult {
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submittedRef = useRef(false)

  async function start(mode: 'practice' | 'mock') {
    if (submittedRef.current) return
    submittedRef.current = true
    setStarting(true)
    setError(null)

    try {
      const result = await startOralExam(mode)
      if (result.success) {
        router.push(`/app/elp/session/${result.sessionId}`)
        return
      }
      setError(result.error)
      submittedRef.current = false
      setStarting(false)
    } catch (err) {
      console.error('[useOralExamStart] startOralExam threw:', err)
      setError('Something went wrong. Please try again.')
      submittedRef.current = false
      setStarting(false)
    }
  }

  return { starting, error, start }
}
