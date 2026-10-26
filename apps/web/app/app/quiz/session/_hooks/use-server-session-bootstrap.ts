import { useEffectEvent, useLayoutEffect, useState } from 'react'
import { claimQuizDeviceBounded } from '../_utils/claim-quiz-device'
import { clearActiveSession, readActiveSession } from '../_utils/quiz-session-storage'

type Opts = { userId: string; sessionId: string }

/** The opened session is the student's only active one (docs/security.md §11d): a local copy of another is stale. */
function dropStaleLocalCopy(userId: string, sessionId: string): void {
  if (readActiveSession(userId)?.sessionId !== sessionId) clearActiveSession(userId)
}

/**
 * Claims the session for this tab without holding the first question back. Dispatched from a
 * layout effect so the claim is the first Server Action of the tab, ahead of every child's
 * mount-time passive effect. No descendant may dispatch a
 * Server Action from a layout effect: child layout effects commit first.
 */
export function useServerSessionBootstrap({ userId, sessionId }: Readonly<Opts>) {
  const [claimError, setClaimError] = useState<string | null>(null)
  const dropStale = useEffectEvent(() => dropStaleLocalCopy(userId, sessionId))

  useLayoutEffect(() => {
    let cancelled = false
    dropStale()
    void claimQuizDeviceBounded(sessionId).then((error) => {
      if (cancelled) return
      setClaimError(error)
    })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  return { claimError }
}
