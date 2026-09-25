'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import {
  RETRY_DIFFERENT_PASSWORD_MESSAGE,
  refuseIfTempPasswordExpired,
  TEMP_PASSWORD_EXPIRED_MESSAGE,
} from '@/lib/auth/temp-password'
import { clearTempPassword } from '@/lib/auth/temp-password-admin'

export type ResetOwnPasswordResult =
  | { ok: true }
  | { ok: false; isSessionMissing: boolean; message: string }

export async function resetOwnPassword(raw: unknown): Promise<ResetOwnPasswordResult> {
  const parsed = NewPasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      isSessionMissing: false,
      message: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return {
      ok: false,
      isSessionMissing: true,
      message: 'Your reset link has expired. Please request a new one.',
    }
  }

  const state = await refuseIfTempPasswordExpired(supabase, user.id)
  if (state === 'expired') {
    return { ok: false, isSessionMissing: false, message: TEMP_PASSWORD_EXPIRED_MESSAGE }
  }
  if (state === 'error') {
    return {
      ok: false,
      isSessionMissing: false,
      message: 'Unable to update password. Please try again.',
    }
  }

  return finishPasswordReset(supabase, user.id, parsed.data.password, state === 'active')
}

/** Applies the new password, clears an active temp-password flag, and signs out on success. */
async function finishPasswordReset(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  password: string,
  clearTempFlag: boolean,
): Promise<ResetOwnPasswordResult> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    const isSessionMissing = error.message?.includes('session missing')
    return {
      ok: false,
      isSessionMissing,
      message: isSessionMissing
        ? 'Your reset link has expired. Please request a new one.'
        : 'Unable to update password. Please try again.',
    }
  }

  if (clearTempFlag) {
    const { success: cleared } = await clearTempPassword(userId)
    if (!cleared) {
      return { ok: false, isSessionMissing: false, message: RETRY_DIFFERENT_PASSWORD_MESSAGE }
    }
  }
  await supabase.auth.signOut()

  return { ok: true }
}
