'use server'

import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { sendEmailBatch } from '@/lib/email/resend'
import { sittingCodeEmail } from '@/lib/email/templates/sitting-code'
import { getSittingCodesForEmail } from '../../email-queries'
import { sittingEmailRefusal } from '../_utils/sitting-email-gate'
import { recordEmailedCodes } from './record-emailed-codes'
import { revalidateSitting, type SittingActionResult } from './sitting-action-result'

const Schema = z.object({ sittingId: z.uuid() })

export type EmailCodesResult = {
  sent: number
  failed: { studentName: string | null; subjectName: string }[]
  skipped: number
  /** Sent, but `emailed_at` not stamped: the next run emails them again unless consumed, voided or expired meanwhile. */
  unrecorded: number
}

/** Emails every unused, not-yet-emailed code of a sitting to its student. */
export async function emailSittingCodes(
  input: unknown,
): Promise<SittingActionResult<EmailCodesResult>> {
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { sittingId } = parsed.data
  const { supabase, organizationId } = await requireAdmin()
  let found: Awaited<ReturnType<typeof getSittingCodesForEmail>>
  try {
    found = await getSittingCodesForEmail(organizationId, sittingId)
  } catch (err) {
    unstable_rethrow(err)
    console.error('[emailSittingCodes] lookup failed', err)
    return { success: false, error: 'Failed to send email' }
  }
  const { sitting, rows, skipped } = found
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
    ...sittingCodeEmail({
      studentName: r.studentName,
      subjectName: r.subjectName,
      code: r.code,
      scheduledAt: r.scheduledAt,
      mode: r.mode,
      examUrl,
    }),
  }))
  const { sent, failed } = rows.length ? await sendEmailBatch(messages) : { sent: [], failed: [] }
  const sentIds = sent.flatMap((i) => rows[i]?.codeId ?? [])
  const unrecorded = await recordEmailedCodes((fn, args) => supabase.rpc(fn, args), sentIds)
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
