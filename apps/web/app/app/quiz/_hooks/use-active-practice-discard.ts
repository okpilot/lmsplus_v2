'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { discardQuiz } from '../actions/discard'
import { clearActiveSession } from '../session/_utils/quiz-session-storage'

export type UseActivePracticeDiscard = {
  discard: () => Promise<void>
  loading: boolean
  error: string | null
  discarded: boolean
  clearError: () => void
}

/**
 * Owns the discard workflow for the active-practice banner: the synchronous one-shot
 * re-entry guard, the discardQuiz mutation, the in-place router.refresh, and the
 * loading/error/discarded state. The component renders; this hook holds the logic.
 */
export function useActivePracticeDiscard(
  sessionId: string,
  userId: string,
): UseActivePracticeDiscard {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)
  // Synchronous one-shot guard (code-style §6): a useState/isPending flag is async
  // and a double-trigger (dialog action + keypress) could both pass before commit.
  const discardingRef = useRef(false)

  const clearError = useCallback(() => setError(null), [])

  const discard = useCallback(async () => {
    if (discardingRef.current) return
    discardingRef.current = true
    setLoading(true)
    setError(null)
    // Always clear — respect discard intent even if Server Action fails (mirrors
    // quiz-submit.ts discardQuizSession). This banner is DB-backed while the recovery
    // banner is localStorage-backed, so leaving the key behind is what let a discarded
    // session still offer Resume (#1190). safeRemove swallows, so this cannot abort the
    // discard below.
    clearActiveSession(userId)
    try {
      const result = await discardQuiz({ sessionId })
      if (result.success) {
        setDiscarded(true)
        router.refresh()
        return
      }
      setError(result.error ?? 'Failed to discard. Please try again.')
      discardingRef.current = false
    } catch {
      setError('Server unavailable. Please try again later.')
      discardingRef.current = false
    } finally {
      setLoading(false)
    }
  }, [router, sessionId, userId])

  return { discard, loading, error, discarded, clearError }
}
