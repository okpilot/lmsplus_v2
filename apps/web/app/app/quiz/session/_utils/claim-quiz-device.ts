import { withTimeout } from '@/lib/utils/with-timeout'
import { isDisplayableProgressError, isTakeoverError } from '../../actions/progress-error-messages'
import { claimQuizSession } from '../../actions/quiz-progress'
import { getQuizDeviceId } from './quiz-device-id'
import { announceClaim, clearTakenOver, markTakenOver } from './session-takeover'

// Claiming is a background nicety: if it hangs, the session loads anyway after this window.
export const CLAIM_TIMEOUT_MS = 3000

type ClaimResult = Awaited<ReturnType<typeof claimQuizSession>>

function startClaim(sessionId: string): Promise<ClaimResult | null> {
  return (async () => claimQuizSession({ sessionId, deviceId: getQuizDeviceId() }))().catch(
    (err) => {
      console.warn('[claimQuizDevice] claim failed (best-effort):', err)
      return null
    },
  )
}

/** A landed claim clears the taken-over flag and announces itself to sibling tabs. */
function onClaimLanded(sessionId: string, attempt: Promise<ClaimResult | null>): void {
  void attempt.then((r) => {
    if (r?.success !== true) return
    clearTakenOver(sessionId)
    announceClaim(sessionId)
  })
}

/**
 * Claims the session for this tab, bounded by CLAIM_TIMEOUT_MS. Resolves to the mapped error
 * copy for a displayable failure, else null (success, timeout, network or unmapped failure).
 * Never rejects.
 */
export function claimQuizDeviceBounded(sessionId: string): Promise<string | null> {
  const attempt = startClaim(sessionId)
  onClaimLanded(sessionId, attempt)
  const claim = attempt.then((r) => {
    if (!r || r.success) return null
    if (isDisplayableProgressError(r.error)) return r.error
    console.warn('[claimQuizDevice] claim failed (best-effort):', r.error)
    return null
  })
  return withTimeout(claim, CLAIM_TIMEOUT_MS, null)
}

/** Runs `call`; a takeover error marks the session taken over. This tab never claims it back. */
export async function withTakeoverCheck<R extends { success: boolean; error?: string }>(
  sessionId: string,
  call: () => Promise<R>,
): Promise<R> {
  const result = await call()
  if (!result.success && isTakeoverError(result.error)) markTakenOver(sessionId)
  return result
}
