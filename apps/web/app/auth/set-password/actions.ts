'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { clearTempPassword, readTempPasswordState } from '@/lib/auth/temp-password'

const SetPasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export async function setOwnPassword(raw: unknown): Promise<ActionResult> {
  const parsed = SetPasswordSchema.safeParse(raw)
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  let state: Awaited<ReturnType<typeof readTempPasswordState>>
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
