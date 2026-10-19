import type { SessionQuestion } from '@/app/app/_types/session'

export type DiscoveryPrefetch = {
  userId: string
  sessionId: string
  questions: SessionQuestion[]
  flaggedIds: string[]
}

// In-memory only: lives for the soft navigation from the config form to the session
// page; a hard reload loses it and the bootstrap falls back to fetching.
let prefetch: DiscoveryPrefetch | null = null

export function setDiscoveryPrefetch(p: DiscoveryPrefetch) {
  prefetch = p
}

/** Non-consuming: a same-navigation remount (StrictMode) reads it again. */
export function readDiscoveryPrefetch(userId: string, sessionId: string): DiscoveryPrefetch | null {
  if (prefetch?.userId !== userId || prefetch.sessionId !== sessionId) return null
  return prefetch
}

export function clearDiscoveryPrefetch(userId: string) {
  if (prefetch?.userId === userId) prefetch = null
}

/** @internal Test-only reset for the module-level store. */
export function _resetDiscoveryPrefetch() {
  prefetch = null
}
