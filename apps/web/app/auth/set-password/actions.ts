'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { ActionResult } from '@/lib/action-result'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import {
  clearTempPassword,
  readTempPasswordState,
  type TempPasswordState,
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

  let state: TempPasswordState
  try {
    state = await readTempPasswordState(supabase, user.id)
  } catch (err) {
    console.error(
      '[setOwnPassword] Failed to read temp password state:',
      err instanceof Error ? err.message : String(err),
    )
    return { success: false, error: 'Unable to update password. Please try again.' }
  }
  if (state !== 'active') return { success: false, error: 'No temporary password to replace.' }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    console.error('[setOwnPassword] Auth update error:', error.message)
    if (error.code === 'same_password') {
      return { success: false, error: 'Choose a different password.' }
    }
    return { success: false, error: 'Unable to update password. Please try again.' }
  }

  const { success: cleared } = await clearTempPassword(user.id)
  if (!cleared) {
    return {
      success: false,
      error:
        'Your password could not be fully updated. Please try again with a different password.',
    }
  }

  // Audit the password change (best-effort: the password is already changed, so a
  // failed audit write must not fail the action — log it server-side instead).
  await recordAuthEvent(supabase, {
    eventType: 'user.password_changed',
    resourceId: user.id,
    context: 'setOwnPassword',
  })

  return { success: true }
}
