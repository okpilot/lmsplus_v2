'use server'

import { UpdateExamSittingSchema } from '@repo/db/schema'
import { unstable_rethrow } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getChangedNoticeCodes, type UserClient } from '../../notice-queries'
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

type Mode = 'remote' | 'in_person'
type Values = { scheduledAt: string; mode: Mode }
type Change = { old: Values; new: Values }

const isMode = (m: unknown): m is Mode => m === 'remote' || m === 'in_person'

/** The locked row's old values and the committed values, as the RPC returns them; null when absent (old DB). */
function changeValues(row: Record<string, unknown>): Change | null {
  const {
    old_scheduled_at: oldAt,
    old_mode: oldMode,
    new_scheduled_at: newAt,
    new_mode: newMode,
  } = row
  if (typeof oldAt !== 'string' || typeof newAt !== 'string') return null
  if (!isMode(oldMode) || !isMode(newMode)) return null
  return { old: { scheduledAt: oldAt, mode: oldMode }, new: { scheduledAt: newAt, mode: newMode } }
}

/** Change notice to the emailed students; old and new time and mode come from the RPC row. */
async function noticeChange(
  ctx: Ctx,
  change: Change | null,
  codeIds: readonly string[],
): Promise<Notices> {
  try {
    if (!change) return NOTICE_ERROR
    const items = await getChangedNoticeCodes(ctx.orgId, ctx.sittingId, codeIds)
    const { sent, failed, error } = await deliverNotices({
      ...ctx,
      kind: 'changed',
      items,
      sitting: {
        ...change.new,
        oldScheduledAt: change.old.scheduledAt,
        oldMode: change.old.mode,
      },
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
          changeValues(row),
          ids,
        )
      : { sent: 0, failed: [] }
  revalidateSitting(v.sittingId)
  return { success: true, changed: row.changed === true, notices }
}
