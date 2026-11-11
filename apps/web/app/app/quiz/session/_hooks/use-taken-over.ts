'use client'

import { useSyncExternalStore } from 'react'
import { isTakenOver, onTakenOver } from '../_utils/session-takeover'

/** True while another tab or device holds this session. */
export function useTakenOver(sessionId: string): boolean {
  return useSyncExternalStore(
    (cb) => onTakenOver(sessionId, cb),
    () => isTakenOver(sessionId),
    () => false,
  )
}
