import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { useConnectionState } from './use-connection-state'

/** Warns before leaving while `hasUnsavedWork` or a progress save is unsent; never after submit or once the sign-in expired. */
export function useQuizNavigationGuard(hasUnsavedWork: boolean, submitted: boolean): void {
  const { status, pending } = useConnectionState()
  useNavigationGuard(status !== 'signed-out' && !submitted && (hasUnsavedWork || pending > 0))
}
