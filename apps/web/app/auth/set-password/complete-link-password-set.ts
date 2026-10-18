import type { createServerSupabaseClient } from '@repo/db/server'
import { recordOwnPasswordSet } from '@/lib/auth/finish-self-password-change'
import {
  clearRecoveryPendingCookie,
  setRecoveryPendingCookie,
} from '@/lib/auth/recovery-pending-cookie'

export type SetPasswordFromLinkResult =
  | { success: true; redirectTo: string }
  | { success: false; error: string; linkInvalid?: true; redirectTo?: string }

const SAVE_FAILED_MESSAGE = 'We could not save that password. Choose a password on the next screen.'
const SAVE_FAILED_MESSAGES: Record<string, string> = {
  same_password: 'That is your current password. Choose a different one on the next screen.',
  weak_password: 'That password is too weak. Choose a stronger one on the next screen.',
}

/**
 * Runs after `verifyOtp` has consumed the link token and opened a recovery
 * session. The pin cookie goes up BEFORE the password write, so a crash or
 * failure leaves the session confined to `/auth/reset-password` (proxy.ts);
 * it comes down only once the password is saved.
 */
export async function completeLinkPasswordSet(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  { userId, password }: { userId: string; password: string },
): Promise<SetPasswordFromLinkResult> {
  await setRecoveryPendingCookie()

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    console.error('[setPasswordFromLink] Auth update error:', error.message)
    return {
      success: false,
      error: (error.code && SAVE_FAILED_MESSAGES[error.code]) || SAVE_FAILED_MESSAGE,
      redirectTo: '/auth/reset-password',
    }
  }

  await clearRecoveryPendingCookie()
  await recordOwnPasswordSet(supabase, { userId, context: 'setPasswordFromLink' })

  // Non-fatal: the password is set, so a failed revoke is logged, not surfaced.
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
  if (signOutError) {
    console.error('[setPasswordFromLink] sign-out others failed:', signOutError.message)
  }

  return { success: true, redirectTo: '/auth/login-complete' }
}
