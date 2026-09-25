'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import {
  clearTempPassword,
  RETRY_DIFFERENT_PASSWORD_MESSAGE,
  refuseIfTempPasswordExpired,
  TEMP_PASSWORD_EXPIRED_MESSAGE,
} from '@/lib/auth/temp-password'

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

  const refusal = await refuseIfTempPasswordExpired(supabase, user.id)
  if (refusal === 'expired') {
    return { ok: false, isSessionMissing: false, message: TEMP_PASSWORD_EXPIRED_MESSAGE }
  }
  if (refusal === 'error') {
    return {
      ok: false,
      isSessionMissing: false,
      message: 'Unable to update password. Please try again.',
    }
  }

  return finishPasswordReset(supabase, user.id, parsed.data.password)
}

/** Applies the new password and clears the temp-password flag, signing out on success. */
async function finishPasswordReset(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  password: string,
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

  // A left-armed flag would scramble this password at the next login.
  const { success: cleared } = await clearTempPassword(userId)
  if (!cleared) {
    return { ok: false, isSessionMissing: false, message: RETRY_DIFFERENT_PASSWORD_MESSAGE }
  }
  await supabase.auth.signOut()

  return { ok: true }
}
