'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { getFlaggedIds, toggleFlag } from '../../actions/flag'

export function useFlaggedQuestions(questionIds: string[]) {
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const prevIdsRef = useRef<string[]>([])
  // Ref for synchronous guard — avoids stale-closure window in concurrent toggle calls
  const pendingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (prevIdsRef.current === questionIds) return
    prevIdsRef.current = questionIds
    if (questionIds.length === 0) {
      setFlaggedIds(new Set())
      return
    }

    // Ignore a late-resolving fetch once questionIds has changed, so a stale result
    // can't overwrite the flag state for the current question set.
    let cancelled = false
    startTransition(async () => {
      try {
        const result = await getFlaggedIds({ questionIds })
        if (!cancelled) setFlaggedIds(result.success ? new Set(result.flaggedIds) : new Set())
      } catch (err) {
        // A transient failure on mount must not surface as an unhandled rejection.
        // Leave the current set untouched — clearing here would erase a flag the user
        // just toggled optimistically while this initial fetch was still in flight.
        console.error('[useFlaggedQuestions] initial fetch failed:', err)
      }
    })

    return () => {
      cancelled = true
    }
  }, [questionIds])

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
