'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { toggleFlag } from '../../actions/flag'

type ReportFlagContextValue = {
  isFlagged: (questionId: string) => boolean
  isToggling: (questionId: string) => boolean
  toggle: (questionId: string) => void
}

// Null when no provider is present (e.g. admin report views) — the row renders no flag UI.
const ReportFlagContext = createContext<ReportFlagContextValue | null>(null)

export function ReportFlagProvider({
  initialFlaggedIds,
  children,
}: {
  initialFlaggedIds: string[]
  children: React.ReactNode
}) {
  // Seeded server-side; remounted per page via a `key` on this provider so each
  // page's server-read state re-seeds on pagination.
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(() => new Set(initialFlaggedIds))
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  // Ref for synchronous guard — avoids stale-closure window in concurrent toggle calls.
  const pendingRef = useRef<Set<string>>(new Set())

  const toggle = useCallback(async (questionId: string) => {
    if (pendingRef.current.has(questionId)) return
    pendingRef.current.add(questionId)
    setPendingIds((prev) => new Set(prev).add(questionId))
    try {
      // Server-result-driven (mirrors useFlaggedQuestions): set state from result.flagged.
      const result = await toggleFlag({ questionId })
      if (result.success) {
        setFlaggedIds((prev) => {
          const next = new Set(prev)
          if (result.flagged) next.add(questionId)
          else next.delete(questionId)
          return next
        })
      }
    } catch (err) {
      // Best-effort: a thrown action (e.g. network failure) leaves flag state unchanged.
      // Log for observability — this path never touches answer data.
      console.warn('[ReportFlagProvider] flag toggle failed:', err)
    } finally {
      pendingRef.current.delete(questionId)
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(questionId)
        return next
      })
    }
  }, [])

  const value = useMemo<ReportFlagContextValue>(
    () => ({
      isFlagged: (questionId) => flaggedIds.has(questionId),
      isToggling: (questionId) => pendingIds.has(questionId),
      toggle,
    }),
    [flaggedIds, pendingIds, toggle],
  )

  return <ReportFlagContext.Provider value={value}>{children}</ReportFlagContext.Provider>
}

export function useReportFlag(): ReportFlagContextValue | null {
  return useContext(ReportFlagContext)
}
