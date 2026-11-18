'use server'

import { z } from 'zod'
import { voidInternalExamCode } from '../../actions/void-code'
import { revalidateSitting } from './sitting-action-result'

const VoidSittingCodeSchema = z.object({
  sittingId: z.uuid(),
  codeId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
})

type VoidResult = Awaited<ReturnType<typeof voidInternalExamCode>>

/** Voids a code through the legacy RPC (admin-only, audited); refreshes the sitting page. */
export async function voidSittingCode(input: unknown): Promise<VoidResult> {
  const parsed = VoidSittingCodeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { sittingId, codeId, reason } = parsed.data
  const result = await voidInternalExamCode({ codeId, reason })
  if (result.success) revalidateSitting(sittingId)
  return result
}
