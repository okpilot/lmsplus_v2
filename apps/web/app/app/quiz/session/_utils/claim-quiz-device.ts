import { withTimeout } from '@/lib/utils/with-timeout'
import {
  isDisplayableProgressError,
  PROGRESS_ERROR_MESSAGES,
} from '../../actions/progress-error-messages'
import { claimQuizSession } from '../../actions/quiz-progress'
import { getQuizDeviceId } from './quiz-device-id'

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

/**
 * Claims the session for this tab, bounded by CLAIM_TIMEOUT_MS. Resolves to the mapped error
 * copy for a displayable failure, else null (success, timeout, network or unmapped failure).
 * Never rejects.
 */
export function claimQuizDeviceBounded(sessionId: string): Promise<string | null> {
  const attempt = startClaim(sessionId)
  lastClaim = { sessionId, owned: attempt.then((r) => r?.success === true) }
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
 * (then the takeover is genuine). Resolves true when the re-claim succeeded. Never rejects.
 */
export async function reclaimIfUnowned(sessionId: string): Promise<boolean> {
  if (!lastClaim || lastClaim.sessionId !== sessionId) return false
  if (await lastClaim.owned) return false
  const owned = startClaim(sessionId).then((r) => r?.success === true)
  lastClaim = { sessionId, owned }
  return owned
}

/** Runs `call`; on a takeover error with an unowned claim, re-claims and retries it once. */
export async function withClaimRetry<R extends { success: boolean; error?: string }>(
  sessionId: string,
  call: () => Promise<R>,
): Promise<R> {
  const r = await call()
  if (r.success || r.error !== PROGRESS_ERROR_MESSAGES.session_taken_over) return r
  return (await reclaimIfUnowned(sessionId)) ? call() : r
}
