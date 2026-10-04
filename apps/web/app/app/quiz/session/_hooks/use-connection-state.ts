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
  return status === 'offline' || status === 'slow' || status === 'signed-out'
}

/** True while the connection overlay blocks the quiz (offline, slow or signed out). */
export function useConnectionBlocked(): boolean {
  return useSyncExternalStore(subscribeConnection, isBlocked, isBlocked)
}
