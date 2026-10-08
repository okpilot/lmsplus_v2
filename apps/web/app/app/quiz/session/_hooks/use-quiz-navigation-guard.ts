import { useSyncExternalStore } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { getConnectionStatus, subscribeConnection } from '../_utils/connection-state'
import { useBackGuard } from './use-back-guard'

const isSignedOut = () => getConnectionStatus() === 'signed-out'

type Opts = { submitted: boolean; onAttempt: () => void }

/**
 * Arms both leave guards for the whole life of the runner: the native prompt for refresh/close and
 * a Back/Forward interceptor calling `onAttempt`. Off after submit and once the sign-in expired.
 */
export function useQuizNavigationGuard({ submitted, onAttempt }: Readonly<Opts>) {
  const signedOut = useSyncExternalStore(subscribeConnection, isSignedOut, isSignedOut)
  const active = !signedOut && !submitted
  useNavigationGuard(active)
  useBackGuard(active, onAttempt)
}
