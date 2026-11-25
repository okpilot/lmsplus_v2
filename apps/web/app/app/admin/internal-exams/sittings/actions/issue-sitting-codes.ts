'use server'

import { IssueSittingCodesSchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  firstRow,
  num,
  revalidateSitting,
  type SittingActionResult,
  sittingFailure,
} from './sitting-action-result'

export type IssueCounts = {
  issued: number
  reissuedAfterExpiry: number
  skippedAlreadyIssued: number
  skippedAttemptTaken: number
  skippedDeactivated: number
  skippedNoConfig: number
  skippedNotEnrolled: number
  skippedPassed: number
}

export async function issueSittingCodes(input: unknown): Promise<SittingActionResult<IssueCounts>> {
  const parsed = IssueSittingCodesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { sittingId, userIds, entryIds } = parsed.data
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('issue_sitting_exam_codes', {
    p_sitting_id: sittingId,
    ...(userIds ? { p_user_ids: userIds } : {}),
    ...(entryIds ? { p_entry_ids: entryIds } : {}),
  })
  if (error) return sittingFailure(error.message, 'Failed to issue codes')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to issue codes' }
  revalidateSitting(sittingId)
  return {
    success: true,
    issued: num(row, 'issued'),
    reissuedAfterExpiry: num(row, 'reissued_after_expiry'),
    skippedAlreadyIssued: num(row, 'skipped_already_issued'),
    skippedAttemptTaken: num(row, 'skipped_attempt_taken'),
    skippedDeactivated: num(row, 'skipped_deactivated'),
    skippedNoConfig: num(row, 'skipped_no_config'),
    skippedNotEnrolled: num(row, 'skipped_not_enrolled'),
    skippedPassed: num(row, 'skipped_passed'),
  }
}
