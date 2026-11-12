'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { isTakenOver, onTakenOver } from '../_utils/session-takeover'

/** True while another tab or device holds this session. */
export function useTakenOver(sessionId: string): boolean {
  const subscribe = useCallback((cb: () => void) => onTakenOver(sessionId, cb), [sessionId])
  return useSyncExternalStore(
    subscribe,
    () => isTakenOver(sessionId),
    () => false,
  )
}
