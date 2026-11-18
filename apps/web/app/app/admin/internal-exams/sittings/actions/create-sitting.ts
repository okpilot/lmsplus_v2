'use server'

import { CreateExamSittingSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { SITTING_ROOT, type SittingActionResult, sittingFailure } from './sitting-action-result'

export async function createSitting(
  input: unknown,
): Promise<SittingActionResult<{ sittingId: string }>> {
  const parsed = CreateExamSittingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const v = parsed.data
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('create_exam_sitting', {
    p_scheduled_at: v.scheduledAt,
    p_mode: v.mode,
    p_invigilator_id: v.invigilatorId,
  })
  if (error) return sittingFailure(error.message, 'Failed to create sitting')
  const sittingId = data?.[0]?.sitting_id
  if (!sittingId) return { success: false, error: 'Failed to create sitting' }
  revalidatePath(SITTING_ROOT)
  return { success: true, sittingId }
}
