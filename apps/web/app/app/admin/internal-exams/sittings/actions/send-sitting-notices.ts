'use server'

import { ExamSittingIdSchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import { deliverPendingNotices, type NoticeResult } from '../_utils/deliver-notices'
import { revalidateSitting, type SittingActionResult } from './sitting-action-result'

/** Emails the next batch of deliverable pending removal and cancellation notices of a sitting (whole students, up to 200 rows). */
export async function sendSittingNotices(
  input: unknown,
): Promise<SittingActionResult<NoticeResult>> {
  const parsed = ExamSittingIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { supabase, organizationId } = await requireAdmin()
  const { sittingId } = parsed.data
  const result = await deliverPendingNotices({ supabase, orgId: organizationId, sittingId })
  revalidateSitting(sittingId)
  if (result.error && result.sent === 0 && result.failed.length === 0)
    return { success: false, error: 'Failed to send notices' }
  return { success: true, ...result }
}
