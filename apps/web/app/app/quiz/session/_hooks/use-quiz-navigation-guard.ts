import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { useConnectionState } from './use-connection-state'

/** Warns before leaving while `hasUnsavedWork` or a progress save is unsent; never after submit. */
export function useQuizNavigationGuard(hasUnsavedWork: boolean, submitted: boolean): void {
  const { pending } = useConnectionState()
  useNavigationGuard(!submitted && (hasUnsavedWork || pending > 0))
}
