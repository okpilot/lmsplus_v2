'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { ActionResult } from '@/lib/action-result'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import {
  clearTempPassword,
  RETRY_DIFFERENT_PASSWORD_MESSAGE,
  readTempPasswordState,
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

  return finishPasswordSet(supabase, user.id, parsed.data.password)
}

/** Reads the caller's temp-password state and refuses unless a temp password is active. */
async function readActiveTempPasswordState(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: ActionResult }> {
  try {
    const state = await readTempPasswordState(supabase, userId)
    if (state !== 'active') {
      return { ok: false, error: { success: false, error: 'No temporary password to replace.' } }
    }
    return { ok: true }
  } catch (err) {
    console.error(
      '[setOwnPassword] Failed to read temp password state:',
      err instanceof Error ? err.message : String(err),
    )
    return {
      ok: false,
      error: { success: false, error: 'Unable to update password. Please try again.' },
    }
  }
}

/** Applies the new password, clears the temp-password flag, and best-effort audits the change. */
async function finishPasswordSet(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  password: string,
): Promise<ActionResult> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    console.error('[setOwnPassword] Auth update error:', error.message)
    if (error.code === 'same_password') {
      return { success: false, error: 'Choose a different password.' }
    }
    return { success: false, error: 'Unable to update password. Please try again.' }
  }

  const { success: cleared } = await clearTempPassword(userId)
  if (!cleared) {
    return { success: false, error: RETRY_DIFFERENT_PASSWORD_MESSAGE }
  }

  await signOutOtherSessions(supabase)

  // Audit the password change (best-effort: the password is already changed, so a
  // failed audit write must not fail the action — log it server-side instead).
  await recordAuthEvent(supabase, {
    eventType: 'user.password_changed',
    resourceId: userId,
    context: 'setOwnPassword',
  })

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
