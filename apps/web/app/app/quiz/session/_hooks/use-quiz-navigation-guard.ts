import { useSyncExternalStore } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import {
  getConnectionSnapshot,
  getConnectionStatus,
  subscribeConnection,
} from '../_utils/connection-state'

const isSignedOut = () => getConnectionStatus() === 'signed-out'
const hasPending = () => getConnectionSnapshot().pending > 0

/** Warns before leaving while `hasUnsavedWork` or a progress save is unsent; never after submit or once the sign-in expired. */
export function useQuizNavigationGuard(hasUnsavedWork: boolean, submitted: boolean): void {
  const signedOut = useSyncExternalStore(subscribeConnection, isSignedOut, isSignedOut)
  const unsent = useSyncExternalStore(subscribeConnection, hasPending, hasPending)
  useNavigationGuard(!signedOut && !submitted && (hasUnsavedWork || unsent))
}
