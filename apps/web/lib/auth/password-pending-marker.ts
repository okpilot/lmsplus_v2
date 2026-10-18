import { adminClient } from '@repo/db/admin'

/**
 * Clears `users.temp_password_expires_at`, the "login instructions sent, own
 * password not yet set" marker, via the service-role client. Best-effort: the
 * marker only drives an admin-list label, so a failure is logged and never
 * surfaced, and a row with no marker (zero rows updated) is a success.
 */
export async function clearPasswordPendingMarker(userId: string): Promise<void> {
  const { data, error } = await adminClient
    .from('users')
    .update({ temp_password_expires_at: null })
    .eq('id', userId)
    .is('deleted_at', null)
    .not('temp_password_expires_at', 'is', null)
    .select('id')

  if (error) {
    console.error('[clearPasswordPendingMarker] update failed:', error.message)
    return
  }
  if ((data?.length ?? 0) > 0) {
    console.log('[clearPasswordPendingMarker] cleared marker for', userId)
  }
}
