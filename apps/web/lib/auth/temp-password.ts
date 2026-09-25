import { randomBytes } from 'node:crypto'
import { adminClient } from '@repo/db/admin'
import type { createMiddlewareSupabaseClient } from '@repo/db/middleware'
import type { createServerSupabaseClient } from '@repo/db/server'

type SupabaseClient =
  | Awaited<ReturnType<typeof createServerSupabaseClient>>
  | ReturnType<typeof createMiddlewareSupabaseClient>['supabase']

export type TempPasswordState = 'none' | 'active' | 'expired'

/** Outcome of `refuseIfTempPasswordExpired`: whether a self-service password write may proceed. */
export type TempPasswordRefusal = 'ok' | 'expired' | 'error'

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
  return Date.parse(expiresAt) <= Date.now() ? 'expired' : 'active'
}

/**
 * Scrambles the user's password to a random, unrecoverable value and signs out
 * every session globally. Best-effort: logs and continues on either failure,
 * never throws. Does NOT clear `temp_password_expires_at` — callers needing
 * that call `clearTempPassword` separately.
 */
export async function expireTempPassword(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    password: randomBytes(32).toString('base64url'),
  })
  if (updateError) {
    console.error('[expireTempPassword] password scramble failed:', updateError.message)
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
  if (signOutError) {
    console.error('[expireTempPassword] global sign-out failed:', signOutError.message)
  }
}

/**
 * Shared self-defence guard for every Server Action that lets a caller set
 * their own password (reset, forced-change, and settings change). Reads the
 * caller's temp-password state and fails closed: a read error refuses the
 * write just like an actually-expired one, so no self-service path can slip
 * through on a transient DB failure. On `'expired'` it also scrambles the
 * password and signs out globally, mirroring the proxy gate's behaviour.
 */
export async function refuseIfTempPasswordExpired(
  supabase: SupabaseClient,
  userId: string,
): Promise<TempPasswordRefusal> {
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
  if (state !== 'expired') return 'ok'
  await expireTempPassword(supabase, userId)
  return 'expired'
}

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
