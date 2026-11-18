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

type Data = { codesVoided: number; attemptsRunning: number; absentCount: number }

export async function closeSitting(input: unknown): Promise<SittingActionResult<Data>> {
  const parsed = ExamSittingIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('close_exam_sitting', {
    p_sitting_id: parsed.data.sittingId,
  })
  if (error) return sittingFailure(error.message, 'Failed to close sitting')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to close sitting' }
  revalidateSitting(parsed.data.sittingId)
  return {
    success: true,
    codesVoided: num(row, 'codes_voided'),
    attemptsRunning: num(row, 'attempts_running'),
    absentCount: num(row, 'absent_count'),
  }
}
