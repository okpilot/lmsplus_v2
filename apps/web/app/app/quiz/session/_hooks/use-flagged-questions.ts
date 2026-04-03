'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { getFlaggedIds, toggleFlag } from '../../actions/flag'

export function useFlaggedQuestions(questionIds: string[]) {
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const prevIdsRef = useRef<string[]>([])

  // Fetch flagged status when questionIds change (ref-equality skip first to prevent loops)
  useEffect(() => {
    if (prevIdsRef.current === questionIds) return
    prevIdsRef.current = questionIds
    if (questionIds.length === 0) {
      setFlaggedIds(new Set())
      return
    }

    startTransition(async () => {
      const result = await getFlaggedIds({ questionIds })
      if (result.success) {
        setFlaggedIds(new Set(result.flaggedIds))
      } else {
        setFlaggedIds(new Set())
      }
    })
  }, [questionIds])

  const toggle = useCallback(
    async (questionId: string) => {
      if (pendingIds.has(questionId)) return false
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
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev)
          next.delete(questionId)
          return next
        })
      }
    },
    [pendingIds],
  )

  const isFlagged = useCallback((questionId: string) => flaggedIds.has(questionId), [flaggedIds])
  const isToggling = useCallback((questionId: string) => pendingIds.has(questionId), [pendingIds])

  return { flaggedIds, isFlagged, toggleFlag: toggle, isToggling }
}
