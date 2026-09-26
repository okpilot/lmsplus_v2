import type { createServerSupabaseClient } from '@repo/db/server'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { generateTempPassword } from '@/lib/auth/generate-temp-password'
import { TEMP_PASSWORD_TTL_MS } from '@/lib/auth/temp-password-admin'
import { sendEmail } from '@/lib/email/resend'
import { loginInstructionsEmail } from '@/lib/email/templates/login-instructions'
import type { LoginInstructionsRecipient } from '../login-instructions-recipient'
import { issueTempPassword } from './issue-temp-password'
import type { SendLoginInstructionsResult } from './send-login-instructions'

type DeliverOutcome = { ok: true } | { ok: false; result: SendLoginInstructionsResult }

/**
 * Generates a new temp password, issues it via Auth (arm → write → re-arm),
 * audits the change once it took effect, and emails it to the recipient.
 * Returns `{ ok: true }` once the email is sent, or `{ ok: false, result }`
 * with the domain error to return.
 */
export async function issueAndEmailPassword(opts: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  id: string
  organizationId: string
  recipient: LoginInstructionsRecipient
}): Promise<DeliverOutcome> {
  const password = generateTempPassword()
  const outcome = await issueTempPassword({
    userId: opts.id,
    organizationId: opts.organizationId,
    password,
    priorExpiresAt: opts.recipient.tempPasswordExpiresAt,
  })
  if (outcome === 'failed') {
    return { ok: false, result: { success: false, error: 'Failed to send login instructions' } }
  }
  // Admin's user-context client, so auth.uid() is the real actor. Best-effort.
  await recordAuthEvent(opts.supabase, {
    eventType: 'user.password_reset',
    resourceId: opts.id,
    context: 'sendLoginInstructions',
  })
  if (outcome === 'issued_not_armed') {
    return {
      ok: false,
      result: {
        success: false,
        error: 'Password was changed but not marked temporary. Send again.',
      },
    }
  }

  return sendPasswordEmail(opts.recipient, password)
}

/** Emails the newly issued password; logs and reports failure without re-issuing. */
async function sendPasswordEmail(
  recipient: LoginInstructionsRecipient,
  password: string,
): Promise<DeliverOutcome> {
  const emailed = await sendEmail({
    to: recipient.email,
    ...loginInstructionsEmail({
      fullName: recipient.fullName,
      email: recipient.email,
      tempPassword: password,
      expiresAt: new Date(Date.now() + TEMP_PASSWORD_TTL_MS).toISOString(),
      loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/`,
    }),
  })
  if (emailed.ok) return { ok: true }

  console.error('[sendLoginInstructions] send failed:', emailed.error)
  return {
    ok: false,
    result: {
      success: false,
      error: 'The password was replaced but the email could not be sent. Send again.',
    },
  }
}
