'use server'

import { ExamSittingIdSchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  firstRow,
  num,
  revalidateSitting,
  type SittingActionResult,
  sittingFailure,
} from './sitting-action-result'

export async function cancelSitting(
  input: unknown,
): Promise<SittingActionResult<{ codesVoided: number }>> {
  const parsed = ExamSittingIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('cancel_exam_sitting', {
    p_sitting_id: parsed.data.sittingId,
  })
  if (error) return sittingFailure(error.message, 'Failed to cancel sitting')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to cancel sitting' }
  revalidateSitting(parsed.data.sittingId)
  return { success: true, codesVoided: num(row, 'codes_voided') }
}
