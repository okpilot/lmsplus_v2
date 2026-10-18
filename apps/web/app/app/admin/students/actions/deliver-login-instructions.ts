import type { createServerSupabaseClient } from '@repo/db/server'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { issueSetPasswordToken } from '@/lib/auth/recovery-code'
import { buildSetPasswordUrl } from '@/lib/auth/set-password-link'
import { sendEmail } from '@/lib/email/resend'
import { loginInstructionsEmail } from '@/lib/email/templates/login-instructions'
import type { LoginInstructionsRecipient } from '../login-instructions-recipient'
import type { SendLoginInstructionsResult } from './send-login-instructions'

type DeliverOutcome = { ok: true } | { ok: false; result: SendLoginInstructionsResult }

/**
 * Issues a one-time set-password token (this voids any earlier link or code for
 * the account), audits the issue as `user.password_reset`, and emails the link.
 * Returns `{ ok: true }` once the email is sent, or `{ ok: false, result }` with
 * the domain error to return. The token is never logged.
 */
export async function issueAndEmailSetPasswordLink(opts: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  userId: string
  recipient: LoginInstructionsRecipient
}): Promise<DeliverOutcome> {
  const { recipient } = opts
  const hashedToken = await issueSetPasswordToken(recipient.email)
  if (!hashedToken) {
    return { ok: false, result: { success: false, error: 'Failed to send login instructions' } }
  }

  // Admin's user-context client, so auth.uid() is the real actor. Best-effort.
  await recordAuthEvent(opts.supabase, {
    eventType: 'user.password_reset',
    resourceId: opts.userId,
    context: 'sendLoginInstructions',
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const emailed = await sendEmail({
    to: recipient.email,
    ...loginInstructionsEmail({
      fullName: recipient.fullName,
      email: recipient.email,
      setPasswordUrl: buildSetPasswordUrl(appUrl, hashedToken),
      loginUrl: `${appUrl}/`,
    }),
  })
  if (emailed.ok) return { ok: true }

  console.error('[sendLoginInstructions] send failed:', emailed.error)
  return {
    ok: false,
    result: { success: false, error: 'The email could not be sent. Send again.' },
  }
}
