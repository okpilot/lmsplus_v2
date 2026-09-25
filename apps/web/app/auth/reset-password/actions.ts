'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import {
  clearTempPassword,
  expireTempPassword,
  readTempPasswordState,
} from '@/lib/auth/temp-password'

const TEMP_PASSWORD_EXPIRED =
  'Your temporary password has expired. Ask your instructor to send you new login instructions.'

const RETRY_DIFFERENT_PASSWORD =
  'Your password could not be fully updated. Please try again with a different password.'

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

  const refusal = await refuseExpiredTempPassword(supabase, user.id)
  if (refusal) return refusal

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
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
  const { success: cleared } = await clearTempPassword(user.id)
  if (!cleared) {
    return { ok: false, isSessionMissing: false, message: RETRY_DIFFERENT_PASSWORD }
  }
  await supabase.auth.signOut()

  return { ok: true }
}

/** An expired temporary password cannot be replaced here — only an admin resend re-arms it. */
async function refuseExpiredTempPassword(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<ResetOwnPasswordResult | null> {
  try {
    if ((await readTempPasswordState(supabase, userId)) !== 'expired') return null
  } catch (err) {
    console.error(
      '[resetOwnPassword] temp password state read error:',
      err instanceof Error ? err.message : String(err),
    )
    return {
      ok: false,
      isSessionMissing: false,
      message: 'Unable to update password. Please try again.',
    }
  }
  await expireTempPassword(supabase, userId)
  return { ok: false, isSessionMissing: false, message: TEMP_PASSWORD_EXPIRED }
}
