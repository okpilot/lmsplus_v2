import { useEffect, useSyncExternalStore } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { getConnectionStatus, subscribeConnection } from '../_utils/connection-state'
import { isRunnerExiting, resetRunnerExit, subscribeRunnerExit } from '../_utils/runner-exit'
import { useBackGuard } from './use-back-guard'
import { isConnectionBlocked } from './use-connection-state'

const isSignedOut = () => getConnectionStatus() === 'signed-out'

type Opts = { submitted: boolean; takenOver: boolean; onAttempt: () => void }

/**
 * Arms both leave guards for the whole life of the runner: the native prompt for refresh/close and
 * a Back/Forward interceptor calling `onAttempt`. Once the sign-in expired only the prompt drops
 * (the Sign in hard-navigation must not trigger it). While the connection overlay is up, Back stays
 * guarded and opens no dialog. A confirmed exit (Submit, Leave, Save, Discard) releases both before
 * it navigates. `submitted` and `takenOver` (another tab holds the session) release them too; they
 * re-arm when the flag clears.
 */
export function useQuizNavigationGuard({ submitted, takenOver, onAttempt }: Readonly<Opts>) {
  const signedOut = useSyncExternalStore(subscribeConnection, isSignedOut, isSignedOut)
  const exiting = useSyncExternalStore(subscribeRunnerExit, isRunnerExiting, isRunnerExiting)
  // Start guarded even if an unmounted runner's exit marked late; re-arm once this one is gone.
  useEffect(() => {
    resetRunnerExit()
    return resetRunnerExit
  }, [])
  useNavigationGuard(!signedOut && !submitted && !takenOver && !exiting)
  const guardedAttempt = () => {
    if (!isConnectionBlocked()) onAttempt()
  }
  useBackGuard(!submitted && !takenOver && !exiting, guardedAttempt)
}
