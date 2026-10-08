import { useSyncExternalStore } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { getConnectionStatus, subscribeConnection } from '../_utils/connection-state'
import { useBackGuard } from './use-back-guard'

const isSignedOut = () => getConnectionStatus() === 'signed-out'

type Opts = { submitted: boolean; onAttempt: () => void; key: string }

/**
 * Arms both leave guards for the whole life of the runner: the native prompt for refresh/close and
 * a Back/Forward interceptor calling `onAttempt`. Both are off after submit. Once the sign-in
 * expired only the prompt drops (the Sign in hard-navigation must not trigger it); Back stays
 * guarded so the sentinel entry is never orphaned, and the attempt opens no dialog under the overlay.
 */
export function useQuizNavigationGuard({ submitted, onAttempt, key }: Readonly<Opts>) {
  const signedOut = useSyncExternalStore(subscribeConnection, isSignedOut, isSignedOut)
  useNavigationGuard(!signedOut && !submitted)
  const guardedAttempt = () => {
    if (!isSignedOut()) onAttempt()
  }
  useBackGuard(!submitted, guardedAttempt, key)
}
