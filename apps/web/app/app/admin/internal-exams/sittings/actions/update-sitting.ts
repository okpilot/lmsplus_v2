'use server'

import { UpdateExamSittingSchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  firstRow,
  revalidateSitting,
  type SittingActionResult,
  sittingFailure,
} from './sitting-action-result'

export async function updateSitting(
  input: unknown,
): Promise<SittingActionResult<{ changed: boolean }>> {
  const parsed = UpdateExamSittingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const v = parsed.data
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('update_exam_sitting', {
    p_sitting_id: v.sittingId,
    ...(v.scheduledAt ? { p_scheduled_at: v.scheduledAt } : {}),
    ...(v.mode ? { p_mode: v.mode } : {}),
    ...(v.invigilatorId ? { p_invigilator_id: v.invigilatorId } : {}),
    ...(v.permittedMaterials === undefined ? {} : { p_permitted_materials: v.permittedMaterials }),
  })
  if (error) return sittingFailure(error.message, 'Failed to update sitting')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to update sitting' }
  revalidateSitting(v.sittingId)
  return { success: true, changed: row.changed === true }
}
