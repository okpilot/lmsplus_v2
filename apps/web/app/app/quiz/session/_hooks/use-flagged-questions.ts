'use client'

import { useCallback, useRef, useState } from 'react'
import { toggleFlag } from '../../actions/flag'

/**
 * Flag state for the mounted session, seeded from the server via `initialFlaggedIds`
 * (fetched by the session bootstrap alongside the questions — session-bootstrap-load.ts,
 * mirroring the report-flag-context.tsx precedent). There is no re-fetch path by
 * design: the question set is fixed for a mounted session (the loader remounts
 * QuizSession per session), so the seed can never go stale.
 */
export function useFlaggedQuestions(initialFlaggedIds: readonly string[]) {
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(() => new Set(initialFlaggedIds))
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  // Ref for synchronous guard — avoids stale-closure window in concurrent toggle calls
  const pendingRef = useRef<Set<string>>(new Set())

  const toggle = useCallback(async (questionId: string) => {
    if (pendingRef.current.has(questionId)) return false
    pendingRef.current.add(questionId)
    setPendingIds((prev) => new Set(prev).add(questionId))
    try {
      const result = await toggleFlag({ questionId })
      if (result.success) {
        setFlaggedIds((prev) => {
          const next = new Set(prev)
          if (result.flagged) next.add(questionId)
          else next.delete(questionId)
          return next
        })
      }
      return result.success
    } catch (err) {
      // The Server Action can reject on a transient network failure. Swallow it
      // here so the click handler never produces an unhandled rejection; the flag
      // simply stays unchanged and the user can retry.
      console.error('[useFlaggedQuestions] toggle failed:', err)
      return false
    } finally {
      pendingRef.current.delete(questionId)
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(questionId)
        return next
      })
    }
  }, [])

  const isFlagged = useCallback((questionId: string) => flaggedIds.has(questionId), [flaggedIds])
  const isToggling = useCallback((questionId: string) => pendingIds.has(questionId), [pendingIds])

  return { flaggedIds, isFlagged, toggleFlag: toggle, isToggling }
}
