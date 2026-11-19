'use server'

import { UpdateExamSittingSchema } from '@repo/db/schema'
import { unstable_rethrow } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getChangedNoticeCodes, getSittingForNotice, type UserClient } from '../../notice-queries'
import { deliverNotices, type NoticeResult } from '../_utils/deliver-notices'
import {
  firstRow,
  revalidateSitting,
  type SittingActionResult,
  sittingFailure,
} from './sitting-action-result'

type Notices = Pick<NoticeResult, 'sent' | 'failed' | 'error'>

const NOTICE_ERROR: Notices = { sent: 0, failed: [], error: true }

type Ctx = { supabase: UserClient; orgId: string; sittingId: string }

type Old = { scheduledAt: string; mode: 'remote' | 'in_person' }

/** The locked row's pre-update values, as the RPC returns them; null when absent (old DB). */
function oldValues(row: Record<string, unknown>): Old | null {
  const { old_scheduled_at: at, old_mode: mode } = row
  if (typeof at !== 'string' || (mode !== 'remote' && mode !== 'in_person')) return null
  return { scheduledAt: at, mode }
}

/** Change notice to the emailed students; the old time and mode come from the RPC row. */
async function noticeChange(
  ctx: Ctx,
  old: Old | null,
  codeIds: readonly string[],
): Promise<Notices> {
  try {
    const sitting = await getSittingForNotice(ctx.orgId, ctx.sittingId)
    if (!old || !sitting) return NOTICE_ERROR
    const items = await getChangedNoticeCodes(ctx.orgId, ctx.sittingId, codeIds)
    const { sent, failed, error } = await deliverNotices({
      ...ctx,
      kind: 'changed',
      items,
      sitting: { ...sitting, oldScheduledAt: old.scheduledAt, oldMode: old.mode },
    })
    return error ? { sent, failed, error } : { sent, failed }
  } catch (e) {
    unstable_rethrow(e)
    console.error(
      '[updateSitting] change notice failed:',
      e instanceof Error ? e.message : String(e),
    )
    return NOTICE_ERROR
  }
}

export async function updateSitting(
  input: unknown,
): Promise<SittingActionResult<{ changed: boolean; notices: Notices }>> {
  const parsed = UpdateExamSittingSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const v = parsed.data
  const { supabase, organizationId } = await requireAdmin()
  const { data, error } = await supabase.rpc('update_exam_sitting', {
    p_sitting_id: v.sittingId,
    ...(v.scheduledAt ? { p_scheduled_at: v.scheduledAt } : {}),
    ...(v.mode ? { p_mode: v.mode } : {}),
    ...(v.invigilatorId ? { p_invigilator_id: v.invigilatorId } : {}),
  })
  if (error) return sittingFailure(error.message, 'Failed to update sitting')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to update sitting' }
  const ids = Array.isArray(row.notify_code_ids) ? (row.notify_code_ids as string[]) : []
  const notices =
    ids.length > 0
      ? await noticeChange(
          { supabase, orgId: organizationId, sittingId: v.sittingId },
          oldValues(row),
          ids,
        )
      : { sent: 0, failed: [] }
  revalidateSitting(v.sittingId)
  return { success: true, changed: row.changed === true, notices }
}
