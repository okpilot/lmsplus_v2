'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { endDiscovery } from '../../actions/end-discovery'

/**
 * Returns the Discovery Exit handler: best-effort teardown of the active discovery
 * row, then a terminal navigation back to the quiz picker. The endDiscovery() call
 * is awaited so the Server Action settles before the terminal nav and cannot cancel
 * the soft-nav (code-style.md §6); we navigate regardless of its outcome. Called
 * with NO arg — the blanket Exit-button teardown clears every active discovery row.
 *
 * replace (not push): the consumed handoff makes the session page un-resumable, so
 * Back must not be able to reopen the exited runner.
 */
export function useDiscoveryExit() {
  const router = useRouter()
  return useCallback(async () => {
    await endDiscovery().catch(() => {})
    router.replace('/app/quiz')
  }, [router])
}
