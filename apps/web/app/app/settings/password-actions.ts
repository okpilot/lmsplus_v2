'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { clearTempPassword } from '@/lib/auth/temp-password'

const RETRY_DIFFERENT_PASSWORD =
  'Your password could not be fully updated. Please try again with a different password.'

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

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

  // signInWithPassword used for credential verification; side effect: refreshes auth session cookies
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.currentPassword,
  })
  if (signInError) {
    console.error('[changePassword] Current password verification failed:', signInError.message)
    return { success: false, error: 'Current password is incorrect' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    console.error('[changePassword] Auth update error:', error.message)
    if (error.message?.includes('session')) {
      return { success: false, error: 'Session expired. Please sign in again.' }
    }
    return { success: false, error: 'Unable to update password. Please try again.' }
  }

  const { success: cleared } = await clearTempPassword(user.id)
  if (!cleared) return { success: false, error: RETRY_DIFFERENT_PASSWORD }
  // Best-effort audit: the password is already changed.
  await recordAuthEvent(supabase, {
    eventType: 'user.password_changed',
    resourceId: user.id,
    context: 'changePassword',
  })

  return { success: true }
}
