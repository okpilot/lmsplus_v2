import { useEffect, useSyncExternalStore } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { getConnectionStatus, subscribeConnection } from '../_utils/connection-state'
import { isRunnerExiting, resetRunnerExit, subscribeRunnerExit } from '../_utils/runner-exit'
import { useBackGuard } from './use-back-guard'
import { isConnectionBlocked } from './use-connection-state'

const isSignedOut = () => getConnectionStatus() === 'signed-out'

type Opts = { submitted: boolean; onAttempt: () => void }

/**
 * Arms both leave guards for the whole life of the runner: the native prompt for refresh/close and
 * a Back/Forward interceptor calling `onAttempt`. Both are off after submit. Once the sign-in
 * expired only the prompt drops (the Sign in hard-navigation must not trigger it). While the
 * connection overlay is up, Back stays guarded and opens no dialog. A confirmed exit (Leave, Save,
 * Discard, takeover) releases both before it navigates, so Next's full-page-load fallback cannot
 * prompt again.
 */
export function useQuizNavigationGuard({ submitted, onAttempt }: Readonly<Opts>) {
  const signedOut = useSyncExternalStore(subscribeConnection, isSignedOut, isSignedOut)
  const exiting = useSyncExternalStore(subscribeRunnerExit, isRunnerExiting, isRunnerExiting)
  // Re-arm for the next runner once this one is gone.
  useEffect(() => resetRunnerExit, [])
  useNavigationGuard(!signedOut && !submitted && !exiting)
  const guardedAttempt = () => {
    if (!isConnectionBlocked()) onAttempt()
  }
  useBackGuard(!submitted && !exiting, guardedAttempt)
}
