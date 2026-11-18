'use server'

import { AddSittingCandidatesSchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  firstRow,
  num,
  revalidateSitting,
  type SittingActionResult,
  sittingFailure,
} from './sitting-action-result'

type Data = { added: number; skippedExisting: number; skippedDeactivated: number }

export async function addCandidates(input: unknown): Promise<SittingActionResult<Data>> {
  const parsed = AddSittingCandidatesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { sittingId, userIds, groupIds } = parsed.data
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('add_exam_sitting_candidates', {
    p_sitting_id: sittingId,
    ...(userIds.length > 0 ? { p_user_ids: userIds } : {}),
    ...(groupIds.length > 0 ? { p_group_ids: groupIds } : {}),
  })
  if (error) return sittingFailure(error.message, 'Failed to add people')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to add people' }
  revalidateSitting(sittingId)
  return {
    success: true,
    added: num(row, 'added'),
    skippedExisting: num(row, 'skipped_existing'),
    skippedDeactivated: num(row, 'skipped_deactivated'),
  }
}
