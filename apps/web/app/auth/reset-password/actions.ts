'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { clearTempPassword } from '@/lib/auth/temp-password'

const ResetPasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ResetOwnPasswordResult =
  | { ok: true }
  | { ok: false; isSessionMissing: boolean; message: string }

export async function resetOwnPassword(raw: unknown): Promise<ResetOwnPasswordResult> {
  const parsed = ResetPasswordSchema.safeParse(raw)
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

  // Best-effort: the password is already changed, so a failed clear must not
  // fail the action — clearTempPassword logs its own errors.
  await clearTempPassword(user.id)
  await supabase.auth.signOut()

  return { ok: true }
}
