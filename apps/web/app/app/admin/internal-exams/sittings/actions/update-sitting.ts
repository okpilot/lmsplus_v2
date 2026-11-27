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

type Before = Awaited<ReturnType<typeof getSittingForNotice>>

/** Cosmetic reads must not fail the update: a failure only drops the notice. */
async function readBefore(orgId: string, sittingId: string): Promise<Before> {
  try {
    return await getSittingForNotice(orgId, sittingId)
  } catch (e) {
    unstable_rethrow(e)
    console.error('[updateSitting] read before failed:', e instanceof Error ? e.message : String(e))
    return null
  }
}

const NOTICE_ERROR: Notices = { sent: 0, failed: [], error: true }

type Ctx = { supabase: UserClient; orgId: string; sittingId: string }

/** Change notice to the emailed students; the old time and mode come from before the RPC. */
async function noticeChange(ctx: Ctx, old: Before, codeIds: readonly string[]): Promise<Notices> {
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
  const old = await readBefore(organizationId, v.sittingId)
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
      ? await noticeChange({ supabase, orgId: organizationId, sittingId: v.sittingId }, old, ids)
      : { sent: 0, failed: [] }
  revalidateSitting(v.sittingId)
  return { success: true, changed: row.changed === true, notices }
}
