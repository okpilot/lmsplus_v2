import type { createMiddlewareSupabaseClient } from '@repo/db/middleware'
import type { createServerSupabaseClient } from '@repo/db/server'

type SupabaseClient =
  | Awaited<ReturnType<typeof createServerSupabaseClient>>
  | ReturnType<typeof createMiddlewareSupabaseClient>['supabase']

export type TempPasswordState = 'none' | 'active' | 'expired'

export const TEMP_PASSWORD_EXPIRED_MESSAGE =
  'Your temporary password has expired. Ask your instructor to send you new login instructions.'

export const RETRY_DIFFERENT_PASSWORD_MESSAGE =
  'Your password could not be fully updated. Please try again with a different password.'

type TempPasswordRow = { temp_password_expires_at: string | null }

/**
 * Reads the caller's own forced-change/expiry state for a server-issued temp
 * password. `'none'` when the column is null or the row is missing/soft-deleted,
 * `'active'` when the expiry is in the future, `'expired'` when it has passed.
 * Throws on a query error.
 */
export async function readTempPasswordState(
  supabase: SupabaseClient,
  userId: string,
): Promise<TempPasswordState> {
  const { data, error } = await supabase
    .from('users')
    .select('temp_password_expires_at')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle<TempPasswordRow>()

  if (error) throw new Error(`Failed to read temp password state: ${error.message}`)
  const expiresAt = data?.temp_password_expires_at
  if (!expiresAt) return 'none'
  const expiresMs = Date.parse(expiresAt)
  if (Number.isNaN(expiresMs)) {
    throw new Error('Failed to read temp password state: invalid expiry')
  }
  return expiresMs <= Date.now() ? 'expired' : 'active'
}

/**
 * Signs out every session globally for an account whose temp password has
 * expired. Does NOT touch the Auth password — an expired temp password stays
 * a valid credential at the API until an admin Resend, which is accepted;
 * the app-layer gates refuse it regardless. Best-effort: logs and continues
 * on failure, never throws.
 */
export async function signOutExpiredTempPassword(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'global' })
  if (error) {
    console.error('[signOutExpiredTempPassword] global sign-out failed:', error.message)
  }
}

/**
 * Shared self-defence guard for every Server Action that lets a caller set
 * their own password (reset, forced-change, and settings change). Reads the
 * caller's temp-password state and fails closed: a read error refuses the
 * write just like an actually-expired one, so no self-service path can slip
 * through on a transient DB failure. On `'expired'` it also signs out
 * globally, mirroring the proxy gate's behaviour. Returns the resolved state
 * (or `'error'`) so callers can tell an armed account (`'active'`, needs its
 * flag cleared after the write) from one that never had a temp password
 * (`'none'`, no clear needed).
 */
export async function refuseIfTempPasswordExpired(
  supabase: SupabaseClient,
  userId: string,
): Promise<TempPasswordState | 'error'> {
  let state: TempPasswordState
  try {
    state = await readTempPasswordState(supabase, userId)
  } catch (err) {
    console.error(
      '[refuseIfTempPasswordExpired] state read error:',
      err instanceof Error ? err.message : String(err),
    )
    return 'error'
  }
  if (state === 'expired') await signOutExpiredTempPassword(supabase)
  return state
}
