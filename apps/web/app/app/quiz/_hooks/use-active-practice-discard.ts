'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { discardQuiz } from '../actions/discard'
import { clearActiveSession, readActiveSession } from '../session/_utils/quiz-session-storage'

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
    // Clear regardless of the Server Action's outcome — respect discard intent even when it
    // fails (mirrors quiz-submit.ts:68). This banner is DB-backed while the recovery banner
    // is localStorage-backed, so leaving the key behind is what let a discarded session keep
    // offering Resume (#1190).
    //
    // Guarded on the id, unlike the precedents. quiz-submit.ts runs inside the runner that
    // owns the session and use-session-recovery.ts clears the entry it just read, so neither
    // can mismatch. This banner is SERVER-rendered and never revalidated on focus, so a stale
    // tab can hold an old sessionId while localStorage has moved on to a newer session — an
    // unguarded userId-keyed clear would destroy that newer session's answers. The single-
    // active-session invariant (docs/security.md §11d, mig 136) rules out two CONCURRENTLY
    // live sessions but not a stale render. In the #1190 case the two ids are equal, so this
    // does not weaken the fix; readActiveSession purges a malformed, cross-user or >7-day
    // entry itself, so the false branch never leaves garbage behind.
    if (readActiveSession(userId)?.sessionId === sessionId) clearActiveSession(userId)
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
