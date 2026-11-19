'use server'

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { sendEmailBatch } from '@/lib/email/resend'
import { sittingCodeEmail } from '@/lib/email/templates/sitting-code'
import { getSittingCodesForEmail } from '../../email-queries'
import { sittingEmailRefusal } from '../_utils/sitting-email-gate'
import { revalidateSitting, type SittingActionResult } from './sitting-action-result'

const Schema = z.object({ sittingId: z.uuid() })
const RECORD_CHUNK = 50

export type EmailCodesResult = {
  sent: number
  failed: { studentName: string | null; subjectName: string }[]
  skipped: number
  /** Sent, but `emailed_at` not stamped: the next run emails them again. */
  unrecorded: number
}

/** Stamps `emailed_at` for each sent code (user client, audit row each); returns how many failed. */
async function record(
  rpc: (
    fn: 'record_internal_exam_code_emailed',
    args: { p_code_id: string },
  ) => PromiseLike<{
    error: { message: string } | null
  }>,
  codeIds: readonly string[],
): Promise<number> {
  let failed = 0
  for (let i = 0; i < codeIds.length; i += RECORD_CHUNK) {
    const results = await Promise.allSettled(
      codeIds
        .slice(i, i + RECORD_CHUNK)
        .map((id) => rpc('record_internal_exam_code_emailed', { p_code_id: id })),
    )
    failed += results.filter((r) => r.status === 'rejected' || r.value.error).length
  }
  return failed
}

/** Emails every unused, not-yet-emailed code of a sitting to its student. */
export async function emailSittingCodes(
  input: unknown,
): Promise<SittingActionResult<EmailCodesResult>> {
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { sittingId } = parsed.data
  const { supabase, organizationId } = await requireAdmin()
  const { sitting, rows, skipped } = await getSittingCodesForEmail(organizationId, sittingId)
  if (!sitting) return { success: false, error: 'Sitting not found' }
  const refusal = sittingEmailRefusal(sitting.status, sitting.scheduledAt)
  if (refusal) return { success: false, error: refusal }
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) {
    console.error('[emailSittingCodes] NEXT_PUBLIC_APP_URL is not set')
    return { success: false, error: 'Failed to send email' }
  }
  const examUrl = `${base}/app/internal-exam`
  const messages = rows.map((r) => ({
    to: r.email,
    ...sittingCodeEmail({ ...r, studentName: r.studentName, examUrl }),
  }))
  const { sent, failed } = rows.length
    ? await sendEmailBatch(messages, { ids: rows.map((r) => r.codeId) })
    : { sent: [], failed: [] }
  const sentIds = sent.flatMap((i) => rows[i]?.codeId ?? [])
  const unrecorded = await record((fn, args) => supabase.rpc(fn, args), sentIds)
  if (rows.length) revalidateSitting(sittingId)
  return {
    success: true,
    sent: sent.length,
    failed: failed
      .flatMap((f) => rows[f.index] ?? [])
      .map((r) => ({
        studentName: r.studentName,
        subjectName: r.subjectName,
      })),
    skipped,
    unrecorded,
  }
}
