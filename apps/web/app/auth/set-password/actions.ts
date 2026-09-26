'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { ActionResult } from '@/lib/action-result'
import { clearTempFlagAndAudit } from '@/lib/auth/finish-self-password-change'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import {
  RETRY_DIFFERENT_PASSWORD_MESSAGE,
  refuseIfTempPasswordExpired,
  TEMP_PASSWORD_EXPIRED_MESSAGE,
} from '@/lib/auth/temp-password'

export async function setOwnPassword(raw: unknown): Promise<ActionResult> {
  const parsed = NewPasswordSchema.safeParse(raw)
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const stateResult = await readActiveTempPasswordState(supabase, user.id)
  if (!stateResult.ok) return stateResult.error

  return finishPasswordSet(supabase, {
    userId: user.id,
    password: parsed.data.password,
    expiresAt: stateResult.expiresAt,
  })
}

/** Reads the caller's temp-password state and refuses unless a temp password is active. */
async function readActiveTempPasswordState(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<{ ok: true; expiresAt: string } | { ok: false; error: ActionResult }> {
  const result = await refuseIfTempPasswordExpired(supabase, userId)
  if (result.state === 'expired') {
    return { ok: false, error: { success: false, error: TEMP_PASSWORD_EXPIRED_MESSAGE } }
  }
  if (result.state === 'error') {
    return {
      ok: false,
      error: { success: false, error: 'Unable to update password. Please try again.' },
    }
  }
  if (result.state === 'none') {
    return { ok: false, error: { success: false, error: 'No temporary password to replace.' } }
  }
  return { ok: true, expiresAt: result.expiresAt }
}

/** Applies the new password, clears the temp-password flag, and best-effort audits the change. */
async function finishPasswordSet(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  { userId, password, expiresAt }: { userId: string; password: string; expiresAt: string },
): Promise<ActionResult> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    console.error('[setOwnPassword] Auth update error:', error.message)
    if (error.code === 'same_password') {
      return { success: false, error: 'Choose a different password.' }
    }
    return { success: false, error: 'Unable to update password. Please try again.' }
  }

  const cleared = await clearTempFlagAndAudit(supabase, {
    userId,
    tempPasswordExpiresAt: expiresAt,
    context: 'setOwnPassword',
  })

  if (!cleared) {
    return { success: false, error: RETRY_DIFFERENT_PASSWORD_MESSAGE }
  }

  await signOutOtherSessions(supabase)

  return { success: true }
}

/**
 * Revokes sessions opened elsewhere with the temp password. Non-fatal: the
 * password is already set and cleared, so a failed revoke is logged, not
 * surfaced to the caller.
 */
async function signOutOtherSessions(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) {
    console.error('[setOwnPassword] sign-out others failed:', error.message)
  }
}
