'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { clearTempFlagAndAudit } from '@/lib/auth/finish-self-password-change'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import {
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

  const result = await refuseIfTempPasswordExpired(supabase, user.id)
  if (result.state === 'expired') {
    return { ok: false, isSessionMissing: false, message: TEMP_PASSWORD_EXPIRED_MESSAGE }
  }
  if (result.state === 'error') {
    return {
      ok: false,
      isSessionMissing: false,
      message: 'Unable to update password. Please try again.',
    }
  }

  return finishPasswordReset(supabase, {
    userId: user.id,
    password: parsed.data.password,
    tempPasswordExpiresAt: result.state === 'active' ? result.expiresAt : null,
  })
}

/** Applies the new password, clears an active temp-password flag, audits, then signs out. */
async function finishPasswordReset(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  {
    userId,
    password,
    tempPasswordExpiresAt,
  }: { userId: string; password: string; tempPasswordExpiresAt: string | null },
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

  // The audit runs before signOut() because it uses the caller's own session.
  const cleared = await clearTempFlagAndAudit(supabase, {
    userId,
    tempPasswordExpiresAt,
    context: 'resetOwnPassword',
  })

  if (!cleared) {
    return { ok: false, isSessionMissing: false, message: RETRY_DIFFERENT_PASSWORD_MESSAGE }
  }

  const { error: signOutError } = await supabase.auth.signOut()
  if (signOutError) {
    console.error('[resetOwnPassword] sign-out failed:', signOutError.message)
  }

  return { ok: true }
}
