'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import { clearTempFlagAndAudit } from '@/lib/auth/finish-self-password-change'
import {
  RETRY_DIFFERENT_PASSWORD_MESSAGE,
  refuseIfTempPasswordExpired,
  TEMP_PASSWORD_EXPIRED_MESSAGE,
} from '@/lib/auth/temp-password'

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type PasswordChangeOpts = {
  userId: string
  email: string
  currentPassword: string
  password: string
  /** Non-null when a temp password is active; passed to `clearTempPassword` as a compare-and-set token. */
  tempPasswordExpiresAt: string | null
}

export async function changePassword(raw: unknown): Promise<ActionResult> {
  const parsed = ChangePasswordSchema.safeParse(raw)
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const email = user.email
  if (!email) return { success: false, error: 'No email associated with account' }

  const result = await refuseIfTempPasswordExpired(supabase, user.id)
  if (result.state === 'expired') return { success: false, error: TEMP_PASSWORD_EXPIRED_MESSAGE }
  if (result.state === 'error') {
    return { success: false, error: 'Unable to update password. Please try again.' }
  }

  return finishPasswordChange(supabase, {
    userId: user.id,
    email,
    currentPassword: parsed.data.currentPassword,
    password: parsed.data.password,
    tempPasswordExpiresAt: result.state === 'active' ? result.expiresAt : null,
  })
}

/** Verifies the current password, applies the new one, and best-effort audits the change. */
async function finishPasswordChange(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  { userId, email, currentPassword, password, tempPasswordExpiresAt }: PasswordChangeOpts,
): Promise<ActionResult> {
  // signInWithPassword used for credential verification; side effect: refreshes auth session cookies
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (signInError) {
    console.error('[changePassword] Current password verification failed:', signInError.message)
    return { success: false, error: 'Current password is incorrect' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    console.error('[changePassword] Auth update error:', error.message)
    if (error.message?.includes('session')) {
      return { success: false, error: 'Session expired. Please sign in again.' }
    }
    return { success: false, error: 'Unable to update password. Please try again.' }
  }

  const cleared = await clearTempFlagAndAudit(supabase, {
    userId,
    tempPasswordExpiresAt,
    context: 'changePassword',
  })
  if (!cleared) return { success: false, error: RETRY_DIFFERENT_PASSWORD_MESSAGE }

  return { success: true }
}
