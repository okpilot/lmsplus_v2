'use server'

import { RemoveSittingCandidatesSchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  firstRow,
  num,
  revalidateSitting,
  type SittingActionResult,
  sittingFailure,
} from './sitting-action-result'

type Data = { removed: number; entriesRemoved: number; codesVoided: number }

export async function removeCandidates(input: unknown): Promise<SittingActionResult<Data>> {
  const parsed = RemoveSittingCandidatesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('remove_exam_sitting_candidates', {
    p_sitting_id: parsed.data.sittingId,
    p_user_ids: parsed.data.userIds,
  })
  if (error) return sittingFailure(error.message, 'Failed to remove people')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to remove people' }
  revalidateSitting(parsed.data.sittingId)
  return {
    success: true,
    removed: num(row, 'removed'),
    entriesRemoved: num(row, 'entries_removed'),
    codesVoided: num(row, 'codes_voided'),
  }
}
