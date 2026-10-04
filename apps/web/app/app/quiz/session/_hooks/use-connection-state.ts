import { useSyncExternalStore } from 'react'
import {
  type ConnectionSnapshot,
  getConnectionSnapshot,
  subscribeConnection,
} from '../_utils/connection-state'

export function useConnectionState(): ConnectionSnapshot {
  return useSyncExternalStore(subscribeConnection, getConnectionSnapshot, getConnectionSnapshot)
}
