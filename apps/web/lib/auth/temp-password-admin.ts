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
 * Re-arms the temp-password expiry column via the service-role client, scoped
 * to the target user, the admin's organization and a non-soft-deleted row.
 * Used by an admin-issued
 * password reset, which replaces the Auth password with a new temporary one
 * the student must change again.
 */
export async function armTempPassword(
  userId: string,
  organizationId: string,
): Promise<{ success: boolean }> {
  const { data, error } = await adminClient
    .from('users')
    .update({ temp_password_expires_at: new Date(Date.now() + TEMP_PASSWORD_TTL_MS).toISOString() })
    .eq('id', userId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[armTempPassword] update failed:', error.message)
    return { success: false }
  }
  if (!data?.length) {
    console.error('[armTempPassword] zero rows updated for user:', userId)
    return { success: false }
  }
  return { success: true }
}
