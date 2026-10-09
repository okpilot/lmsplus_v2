'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { withTimeout } from '@/lib/utils/with-timeout'
import { endDiscovery } from '../../actions/end-discovery'
import { markRunnerExiting } from '../_utils/runner-exit'
import { NAV_FALLBACK_MS } from './quiz-submit-handlers'

export const DISCOVERY_EXIT_TIMEOUT_MS = 3000

/**
 * Returns `{ exit, leaving }`: the Discovery Exit handler plus a flag that is true from
 * the moment the exit starts, so the confirm dialog can lock while it is in flight.
 * `exit` runs a best-effort teardown of the active discovery row, then a terminal
 * navigation back to the quiz picker. The endDiscovery() call is awaited before the
 * terminal nav (code-style.md §6) for DISCOVERY_EXIT_TIMEOUT_MS at most; we navigate
 * regardless of its outcome. A call still pending then has its result ignored by Next's
 * router action queue (the request still completes), so a stalled request cannot hold
 * the exit. If the runner is still mounted NAV_FALLBACK_MS after the soft nav, a hard
 * navigation to the same page follows (code-style.md §6). Called with NO arg — the
 * blanket Exit-button teardown clears every active discovery row.
 *
 * replace (not push): the consumed handoff makes the session page un-resumable, so
 * Back must not be able to reopen the exited runner.
 *
 * A synchronous useRef one-shot guard (code-style.md §6) blocks re-entry: a rapid
 * double-click must not fire endDiscovery + the terminal nav twice. The ref is set
 * before the first await and is NEVER reset — this is a terminal exit, so a late
 * duplicate call must stay a no-op.
 */
export function useDiscoveryExit() {
  const router = useRouter()
  const exitingRef = useRef(false)
  const [leaving, setLeaving] = useState(false)
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(fallbackTimer.current), [])
  const exit = useCallback(async () => {
    if (exitingRef.current) return
    exitingRef.current = true
    setLeaving(true)
    await withTimeout(
      endDiscovery().catch(() => undefined),
      DISCOVERY_EXIT_TIMEOUT_MS,
      undefined,
    )
    markRunnerExiting()
    router.replace('/app/quiz')
    fallbackTimer.current = setTimeout(() => window.location.assign('/app/quiz'), NAV_FALLBACK_MS)
  }, [router])
  return { exit, leaving }
}
