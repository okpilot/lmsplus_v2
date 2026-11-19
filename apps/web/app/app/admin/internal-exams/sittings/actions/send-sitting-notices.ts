'use server'

import { ExamSittingIdSchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import { deliverPendingNotices, type NoticeResult } from '../_utils/deliver-notices'
import { revalidateSitting, type SittingActionResult } from './sitting-action-result'

/** Emails every deliverable pending removal and cancellation notice of a sitting. */
export async function sendSittingNotices(
  input: unknown,
): Promise<SittingActionResult<NoticeResult>> {
  const parsed = ExamSittingIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { supabase, organizationId } = await requireAdmin()
  const { sittingId } = parsed.data
  const result = await deliverPendingNotices({ supabase, orgId: organizationId, sittingId })
  revalidateSitting(sittingId)
  return { success: true, ...result }
}
