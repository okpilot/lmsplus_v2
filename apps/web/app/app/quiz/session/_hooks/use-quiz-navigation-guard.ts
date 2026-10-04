import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { useConnectionState } from './use-connection-state'

/** Warns before leaving while `hasUnsavedWork` or a progress save is still unsent. */
export function useQuizNavigationGuard(hasUnsavedWork: boolean): void {
  const { pending } = useConnectionState()
  useNavigationGuard(hasUnsavedWork || pending > 0)
}
