'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { markRunnerExiting } from '../_utils/runner-exit'
import { clearTakenOver, onPeerClaim, onTakenOver } from '../_utils/session-takeover'

type TakeoverExitOpts = { enabled: boolean; sessionId: string; probe: () => void }

/**
 * Leaves the runner once another tab or device takes the session over. A claim announced by a
 * sibling tab of this browser triggers `probe`, whose save surfaces the server's verdict.
 */
export function useTakeoverExit({ enabled, sessionId, probe }: Readonly<TakeoverExitOpts>) {
  const router = useRouter()
  const probeRef = useRef(probe)
  probeRef.current = probe

  // Subscriptions only — no data fetching
  useEffect(() => {
    if (!enabled) return
    clearTakenOver(sessionId)
    const offTakeover = onTakenOver(sessionId, () => {
      toast.info('This quiz continued in another tab or device.')
      markRunnerExiting()
      router.replace('/app/quiz')
    })
    const offPeer = onPeerClaim(sessionId, () => probeRef.current())
    return () => {
      offTakeover()
      offPeer()
    }
  }, [enabled, sessionId, router])
}
