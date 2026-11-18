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

type Data = { codesRestamped: number; invigilatorActive: boolean; entriesWithoutCode: number }

export async function startSitting(input: unknown): Promise<SittingActionResult<Data>> {
  const parsed = ExamSittingIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('start_exam_sitting', {
    p_sitting_id: parsed.data.sittingId,
  })
  if (error) return sittingFailure(error.message, 'Failed to start sitting')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to start sitting' }
  revalidateSitting(parsed.data.sittingId)
  return {
    success: true,
    codesRestamped: num(row, 'codes_restamped'),
    invigilatorActive: row.invigilator_active === true,
    entriesWithoutCode: num(row, 'entries_without_code'),
  }
}
