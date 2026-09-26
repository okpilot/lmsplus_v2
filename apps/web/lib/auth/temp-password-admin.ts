import { adminClient } from '@repo/db/admin'

/**
 * 7 days, mirroring the `interval '7 days'` expiry set by
 * `record_login_instructions_sent()` (`supabase/migrations/20260925000100_users_login_instructions.sql`).
 */
export const TEMP_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Clears the temp-password expiry column via the service-role client, scoped
 * to the target user and to a non-soft-deleted row.
 */
export async function clearTempPassword(userId: string): Promise<{ success: boolean }> {
  const { data, error } = await adminClient
    .from('users')
    .update({ temp_password_expires_at: null })
    .eq('id', userId)
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
