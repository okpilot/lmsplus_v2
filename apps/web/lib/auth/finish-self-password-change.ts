import type { createServerSupabaseClient } from '@repo/db/server'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { clearPasswordPendingMarker } from './password-pending-marker'

type RecordOwnPasswordSetOpts = {
  userId: string
  /** Log-prefix label for the audit's best-effort failure line, e.g. 'setPasswordFromLink'. */
  context: string
}

/**
 * After a successful self `updateUser({ password })`: audits the change with
 * the caller's own session, then clears the "own password not set" marker.
 * Both are best-effort — the password is already changed.
 */
export async function recordOwnPasswordSet(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  { userId, context }: RecordOwnPasswordSetOpts,
): Promise<void> {
  await recordAuthEvent(supabase, {
    eventType: 'user.password_changed',
    resourceId: userId,
    context,
  })
  await clearPasswordPendingMarker(userId)
}
