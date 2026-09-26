import type { createServerSupabaseClient } from '@repo/db/server'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { clearTempPassword } from './temp-password-admin'

type FinishSelfPasswordChangeOpts = {
  userId: string
  /** Non-null when a temp password is active; passed to `clearTempPassword` as a compare-and-set token. */
  tempPasswordExpiresAt: string | null
  /** Log-prefix label for the audit's best-effort failure line, e.g. 'setOwnPassword'. */
  context: string
}

/**
 * After a successful self `updateUser({ password })`: clears an active temp
 * flag (compare-and-set on the expiry read before the write), then audits the
 * change whether or not the clear succeeded, since the password is already
 * changed. Returns whether the flag is now clear.
 */
export async function clearTempFlagAndAudit(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  { userId, tempPasswordExpiresAt, context }: FinishSelfPasswordChangeOpts,
): Promise<boolean> {
  const cleared = tempPasswordExpiresAt
    ? (await clearTempPassword(userId, tempPasswordExpiresAt)).success
    : true

  await recordAuthEvent(supabase, {
    eventType: 'user.password_changed',
    resourceId: userId,
    context,
  })

  return cleared
}
