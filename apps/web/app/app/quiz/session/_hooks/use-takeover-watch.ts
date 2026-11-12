'use client'

import { useEffect, useEffectEvent } from 'react'
import { clearTakenOver, onPeerClaim } from '../_utils/session-takeover'

type TakeoverWatchOpts = { enabled: boolean; sessionId: string; probe: () => void }

/**
 * Clears a stale takeover flag on mount. A claim announced by a sibling tab of this browser
 * triggers `probe`, whose save surfaces the server's verdict to the takeover dialog.
 */
export function useTakeoverWatch({ enabled, sessionId, probe }: Readonly<TakeoverWatchOpts>) {
  const runProbe = useEffectEvent(probe)

  // Subscriptions only — no data fetching
  useEffect(() => {
    if (!enabled) return
    clearTakenOver(sessionId)
    return onPeerClaim(sessionId, () => runProbe())
  }, [enabled, sessionId])
}
