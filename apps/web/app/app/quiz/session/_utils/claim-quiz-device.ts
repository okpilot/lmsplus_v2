import { withTimeout } from '@/lib/utils/with-timeout'
import { isDisplayableProgressError } from '../../actions/progress-error-messages'
import { claimQuizSession } from '../../actions/quiz-progress'
import { getQuizDeviceId } from './quiz-device-id'

// Claiming is a background nicety: if it hangs, the session loads anyway after this window.
export const CLAIM_TIMEOUT_MS = 3000

/**
 * Claims the session for this tab, bounded by CLAIM_TIMEOUT_MS. Resolves to the mapped error
 * copy for a displayable failure, else null (success, timeout, network or unmapped failure).
 * Never rejects.
 */
export function claimQuizDeviceBounded(sessionId: string): Promise<string | null> {
  const claim = (async () => claimQuizSession({ sessionId, deviceId: getQuizDeviceId() }))()
    .then((r) => {
      if (r.success) return null
      if (isDisplayableProgressError(r.error)) return r.error
      console.warn('[claimQuizDevice] claim failed (best-effort):', r.error)
      return null
    })
    .catch((err) => {
      console.warn('[claimQuizDevice] claim failed (best-effort):', err)
      return null
    })
  return withTimeout(claim, CLAIM_TIMEOUT_MS, null)
}
