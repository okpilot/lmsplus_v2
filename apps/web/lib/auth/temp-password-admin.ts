import { adminClient } from '@repo/db/admin'

/**
 * 7 days, mirroring the `interval '7 days'` expiry set by
 * `record_login_instructions_sent()` (`supabase/migrations/20260925000100_users_login_instructions.sql`).
 */
export const TEMP_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Clears the temp-password expiry column via the service-role client, scoped
 * to the target user, a non-soft-deleted row, and the expiry value the caller
 * read before writing the new password (compare-and-set). Zero rows updated
 * therefore also means the expiry changed since it was read — e.g. an admin
 * re-armed it in the meantime — so the (new) flag is left as is.
 */
export async function clearTempPassword(
  userId: string,
  expectedExpiresAt: string,
): Promise<{ success: boolean }> {
  const { data, error } = await adminClient
    .from('users')
    .update({ temp_password_expires_at: null })
    .eq('id', userId)
    .eq('temp_password_expires_at', expectedExpiresAt)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[clearTempPassword] update failed:', error.message)
    return { success: false }
  }
  if (!data?.length) {
    console.error('[clearTempPassword] zero rows updated for user:', userId)
    return { success: false }
  }
  return { success: true }
}

/**
 * Sets the expiry column to exactly `expiresAt` via the service-role client,
 * scoped to the target user, the admin's organization, and a non-soft-deleted
 * row. When `matchExpiresAt` is given, also requires the column's current
 * value to equal it (compare-and-set). `logPrefix` is each caller's own name,
 * so `armTempPassword` and `restoreTempPasswordExpiry` keep distinct,
 * independently-greppable log lines despite sharing this body.
 */
async function writeTempPasswordExpiry(opts: {
  userId: string
  organizationId: string
  expiresAt: string | null
  logPrefix: string
  matchExpiresAt?: string
}): Promise<{ success: boolean }> {
  const { userId, organizationId, expiresAt, logPrefix, matchExpiresAt } = opts
  const scoped = adminClient
    .from('users')
    .update({ temp_password_expires_at: expiresAt })
    .eq('id', userId)
    .eq('organization_id', organizationId)
  const matched =
    matchExpiresAt === undefined ? scoped : scoped.eq('temp_password_expires_at', matchExpiresAt)
  const { data, error } = await matched.is('deleted_at', null).select('id')

  if (error) {
    console.error(`[${logPrefix}] update failed:`, error.message)
    return { success: false }
  }
  if (!data?.length) {
    console.error(`[${logPrefix}] zero rows updated for user:`, userId)
    return { success: false }
  }
  return { success: true }
}

/**
 * Re-arms the temp-password expiry column via the service-role client, scoped
 * to the target user, the admin's organization and a non-soft-deleted row.
 * Called by an admin-issued password reset before it writes the new Auth
 * password, which is itself a temporary one the student must change again.
 * On success, also returns the expiry it wrote.
 */
export async function armTempPassword(
  userId: string,
  organizationId: string,
): Promise<{ success: true; expiresAt: string } | { success: false }> {
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_MS).toISOString()
  const { success } = await writeTempPasswordExpiry({
    userId,
    organizationId,
    expiresAt,
    logPrefix: 'armTempPassword',
  })
  return success ? { success: true, expiresAt } : { success: false }
}

/**
 * Restores the temp-password expiry column to `priorExpiresAt`, scoped like
 * `armTempPassword` and additionally requiring the column's current value to
 * equal `armedExpiresAt` (compare-and-set on the arm being undone). Zero rows
 * updated means either the row no longer matches the scope, or the column's
 * value changed since the arm — e.g. a self-service clear or another arm ran
 * in between — so the restore does not overwrite it.
 */
export async function restoreTempPasswordExpiry(opts: {
  userId: string
  organizationId: string
  armedExpiresAt: string
  priorExpiresAt: string | null
}): Promise<{ success: boolean }> {
  const { userId, organizationId, armedExpiresAt, priorExpiresAt } = opts
  return writeTempPasswordExpiry({
    userId,
    organizationId,
    expiresAt: priorExpiresAt,
    logPrefix: 'restoreTempPasswordExpiry',
    matchExpiresAt: armedExpiresAt,
  })
}
