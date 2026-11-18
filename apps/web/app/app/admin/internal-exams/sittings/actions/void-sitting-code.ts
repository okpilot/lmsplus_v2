'use server'

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  firstRow,
  revalidateSitting,
  type SittingActionResult,
  sittingFailure,
} from './sitting-action-result'

const VoidSittingCodeSchema = z.object({
  sittingId: z.uuid(),
  codeId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
})

/** Voids one unused code of the sitting (admin-only, audited); refuses used, voided or foreign codes. */
export async function voidSittingCode(
  input: unknown,
): Promise<SittingActionResult<{ codeId: string }>> {
  const parsed = VoidSittingCodeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { sittingId, codeId, reason } = parsed.data
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('void_sitting_code', {
    p_sitting_id: sittingId,
    p_code_id: codeId,
    p_reason: reason,
  })
  if (error) return sittingFailure(error.message, 'Failed to void code')
  const row = firstRow(data)
  if (!row || typeof row.code_id !== 'string')
    return { success: false, error: 'Failed to void code' }
  revalidateSitting(sittingId)
  return { success: true, codeId: row.code_id }
}
