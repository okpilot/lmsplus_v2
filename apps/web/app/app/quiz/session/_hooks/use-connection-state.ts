import { useSyncExternalStore } from 'react'
import {
  type ConnectionSnapshot,
  getConnectionSnapshot,
  subscribeConnection,
} from '../_utils/connection-state'

export function useConnectionState(): ConnectionSnapshot {
  return useSyncExternalStore(subscribeConnection, getConnectionSnapshot, getConnectionSnapshot)
}

/** True while the connection overlay blocks the quiz (offline or signed out). */
export function useConnectionBlocked(): boolean {
  const { status } = useConnectionState()
  return status === 'offline' || status === 'signed-out'
}
