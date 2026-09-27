import { adminClient } from '@repo/db/admin'

/** Decision 103: throttle state lives in Auth `app_metadata` (service-role write only). */
export const MAX_RECOVERY_CODES_PER_HOUR = 3
const RECOVERY_WINDOW_MS = 60 * 60 * 1000

/**
 * Finds the active (non-soft-deleted) user id for an email via the
 * service-role client. Returns null on no match or a query error — the
 * caller treats both as "no account", preserving the neutral response the
 * forgot-password flow always shows (no account enumeration).
 */
export async function findActiveUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()

  if (error) {
    console.error('[findActiveUserIdByEmail] lookup failed:', error.message)
    return null
  }
  return data?.id ?? null
}

/**
 * Pure window filter: keeps only the timestamps within the last hour of
 * `now`. Exported so the throttle window logic is unit-testable without a
 * network/DB round trip.
 */
export function recentSends(timestamps: string[], now: number): string[] {
  return timestamps.filter((t) => {
    const ms = Date.parse(t)
    return !Number.isNaN(ms) && now - ms < RECOVERY_WINDOW_MS
  })
}

/** Narrows the Auth user's `app_metadata.recovery_code_sent_at` to a string array. */
function readTimestamps(appMetadata: Record<string, unknown>): string[] {
  const raw = appMetadata.recovery_code_sent_at
  return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : []
}

/**
 * Reads, prunes, and — if under the per-hour cap — appends a send timestamp
 * to the Auth user's `app_metadata` (service-role only; never user-writable,
 * per Decision 103). Returns `allowed: false` without writing when the cap is
 * already reached, or when the read/write itself fails — read-then-write, no
 * lock, so a concurrent burst can exceed the cap by the burst size (accepted).
 */
export async function claimRecoverySlot(userId: string): Promise<{ allowed: boolean }> {
  const { data, error } = await adminClient.auth.admin.getUserById(userId)
  if (error || !data.user) {
    console.error('[claimRecoverySlot] failed to read user:', error?.message ?? 'not found')
    return { allowed: false }
  }

  const existing = data.user.app_metadata ?? {}
  const pruned = recentSends(readTimestamps(existing), Date.now())
  if (pruned.length >= MAX_RECOVERY_CODES_PER_HOUR) {
    console.log('[claimRecoverySlot] throttled for user:', userId)
    return { allowed: false }
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { ...existing, recovery_code_sent_at: [...pruned, new Date().toISOString()] },
  })
  if (updateError) {
    console.error('[claimRecoverySlot] failed to record send:', updateError.message)
    return { allowed: false }
  }
  return { allowed: true }
}

/**
 * Issues a fresh recovery code via `generateLink`, returning only the
 * short-lived OTP — never the link itself. The email carries a code, not a
 * clickable URL, because a single-use recovery link gets consumed by mail
 * scanners before the student ever clicks it.
 */
export async function issueRecoveryCode(email: string): Promise<string | null> {
  const { data, error } = await adminClient.auth.admin.generateLink({ type: 'recovery', email })
  if (error) {
    console.error('[issueRecoveryCode] generateLink failed:', error.message)
    return null
  }
  const code = data.properties?.email_otp
  if (!code) {
    console.error('[issueRecoveryCode] generateLink returned no email_otp')
    return null
  }
  return code
}
