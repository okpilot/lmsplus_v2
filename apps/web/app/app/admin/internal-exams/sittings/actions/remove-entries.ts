'use server'

import { RemoveSittingEntriesSchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  firstRow,
  num,
  revalidateSitting,
  type SittingActionResult,
  sittingFailure,
} from './sitting-action-result'

type Data = { removed: number; codesVoided: number }

export async function removeSittingEntries(input: unknown): Promise<SittingActionResult<Data>> {
  const parsed = RemoveSittingEntriesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('remove_exam_sitting_entries', {
    p_sitting_id: parsed.data.sittingId,
    p_entry_ids: parsed.data.entryIds,
  })
  if (error) return sittingFailure(error.message, 'Failed to remove exam')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to remove exam' }
  revalidateSitting(parsed.data.sittingId)
  return { success: true, removed: num(row, 'removed'), codesVoided: num(row, 'codes_voided') }
}
