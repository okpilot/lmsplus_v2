import { withTimeout } from '@/lib/utils/with-timeout'
import { isDisplayableProgressError, isTakeoverError } from '../../actions/progress-error-messages'
import { claimQuizSession } from '../../actions/quiz-progress'
import { getQuizDeviceId } from './quiz-device-id'
import { announceClaim, clearTakenOver, markTakenOver } from './session-takeover'

// Claiming is a background nicety: if it hangs, the session loads anyway after this window.
export const CLAIM_TIMEOUT_MS = 3000

// The latest claim this tab made: whether it landed decides if a takeover error is genuine.
let lastClaim: { sessionId: string; owned: Promise<boolean> } | null = null

/** Test-only: forgets the recorded claim. */
export function _resetClaimState(): void {
  lastClaim = null
}

type ClaimResult = Awaited<ReturnType<typeof claimQuizSession>>

function startClaim(sessionId: string): Promise<ClaimResult | null> {
  return (async () => claimQuizSession({ sessionId, deviceId: getQuizDeviceId() }))().catch(
    (err) => {
      console.warn('[claimQuizDevice] claim failed (best-effort):', err)
      return null
    },
  )
}

/** Resolves whether the claim landed; a landed claim clears the taken-over flag and announces. */
function trackOwned(sessionId: string, attempt: Promise<ClaimResult | null>): Promise<boolean> {
  return attempt.then((r) => {
    if (r?.success !== true) return false
    clearTakenOver(sessionId)
    announceClaim(sessionId)
    return true
  })
}

/**
 * Claims the session for this tab, bounded by CLAIM_TIMEOUT_MS. Resolves to the mapped error
 * copy for a displayable failure, else null (success, timeout, network or unmapped failure).
 * Never rejects.
 */
export function claimQuizDeviceBounded(sessionId: string): Promise<string | null> {
  const attempt = startClaim(sessionId)
  lastClaim = { sessionId, owned: trackOwned(sessionId, attempt) }
  const claim = attempt.then((r) => {
    if (!r || r.success) return null
    if (isDisplayableProgressError(r.error)) return r.error
    console.warn('[claimQuizDevice] claim failed (best-effort):', r.error)
    return null
  })
  return withTimeout(claim, CLAIM_TIMEOUT_MS, null)
}

/**
 * After a takeover error: claims once more unless this tab's own claim already succeeded
 * (then the takeover is genuine). A claim started after the failed call was sent decides
 * instead. Resolves true when the call should be retried. Never rejects.
 */
async function reclaimIfUnowned(sessionId: string, seen: typeof lastClaim): Promise<boolean> {
  const claim = lastClaim
  if (!claim || claim.sessionId !== sessionId) return false
  if (claim !== seen) return claim.owned
  if (await claim.owned) return false
  const owned = trackOwned(sessionId, startClaim(sessionId))
  lastClaim = { sessionId, owned }
  return owned
}

/** Another tab claimed after this one: this tab must not re-claim on its next takeover error. */
export function yieldClaim(sessionId: string): void {
  if (lastClaim?.sessionId === sessionId) lastClaim = null
}

/** Runs `call`; on a takeover error with an unowned claim, re-claims and retries it once. */
export async function withClaimRetry<R extends { success: boolean; error?: string }>(
  sessionId: string,
  call: () => Promise<R>,
): Promise<R> {
  const seen = lastClaim
  const first = await call()
  if (first.success || !isTakeoverError(first.error)) return first
  const final = (await reclaimIfUnowned(sessionId, seen)) ? await call() : first
  if (!final.success && isTakeoverError(final.error)) markTakenOver(sessionId)
  return final
}
