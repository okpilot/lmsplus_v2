import { useSyncExternalStore } from 'react'
import {
  type ConnectionSnapshot,
  getConnectionSnapshot,
  getConnectionStatus,
  subscribeConnection,
} from '../_utils/connection-state'

export function useConnectionState(): ConnectionSnapshot {
  return useSyncExternalStore(subscribeConnection, getConnectionSnapshot, getConnectionSnapshot)
}

function isBlocked(): boolean {
  const status = getConnectionStatus()
  return (
    status === 'offline' || status === 'slow' || status === 'signed-out' || status === 'save-failed'
  )
}

/** True while the connection overlay blocks the quiz (offline, slow, signed out or an answer save held). */
export function useConnectionBlocked(): boolean {
  return useSyncExternalStore(subscribeConnection, isBlocked, isBlocked)
}
