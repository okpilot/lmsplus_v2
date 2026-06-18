'use server'

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { sendEmail } from '@/lib/email/resend'
import { internalExamCodeEmail } from '@/lib/email/templates/internal-exam-code'
import { rpc } from '@/lib/supabase-rpc'
import { getInternalExamCodeForEmail } from '../email-queries'

const SendCodeEmailSchema = z.object({ codeId: z.uuid() })

// error is a closed set of admin-facing domain strings (safe to display directly,
// e.g. via toast). Keeping it a literal union — not `string` — prevents a future
// change from silently leaking an internal/third-party message to the client.
export type SendCodeEmailResult =
  | { success: true }
  | {
      success: false
      error:
        | 'Invalid input'
        | 'Code not found'
        | 'Code is no longer active'
        | 'Failed to send email'
    }

export async function sendInternalExamCodeEmail(input: unknown): Promise<SendCodeEmailResult> {
  const parsed = SendCodeEmailSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase } = await requireAdmin()

  const payload = await getInternalExamCodeForEmail(parsed.data.codeId)
  if (!payload) return { success: false, error: 'Code not found' }

  const isExpired = new Date(payload.expiresAt).getTime() <= Date.now()
  if (payload.consumedAt || payload.voidedAt || isExpired) {
    return { success: false, error: 'Code is no longer active' }
  }

  // Fail fast on a misconfigured base URL rather than emailing a broken link
  // (NEXT_PUBLIC_APP_URL is always set in a correctly-configured env).
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error('[sendInternalExamCodeEmail] NEXT_PUBLIC_APP_URL is not set')
    return { success: false, error: 'Failed to send email' }
  }
  const examUrl = `${process.env.NEXT_PUBLIC_APP_URL}/app/internal-exam`
  const { subject, html, text } = internalExamCodeEmail({
    studentName: payload.studentName,
    subjectName: payload.subjectName,
    code: payload.code,
    expiresAt: payload.expiresAt,
    examUrl,
  })

  const sent = await sendEmail({ to: payload.studentEmail, subject, html, text })
  if (!sent.ok) {
    console.error('[sendInternalExamCodeEmail] send failed:', sent.error)
    return { success: false, error: 'Failed to send email' }
  }

  // Best-effort audit via the admin's user-context client (auth.uid() = admin),
  // not adminClient. The email is already sent, so a failed audit is logged, not surfaced.
  const { error: auditErr } = await rpc(supabase, 'record_internal_exam_code_emailed', {
    p_code_id: parsed.data.codeId,
  })
  if (auditErr) {
    console.error('[sendInternalExamCodeEmail] Audit event failed:', auditErr.message)
  }

  return { success: true }
}
