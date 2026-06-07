import { adminClient } from '@repo/db/admin'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'

const PERMANENT_BAN = '876600h'
const NO_BAN = 'none'

type StatusChange = {
  id: string
  orgId: string
  /** Log-prefix label identifying the calling mutation. */
  context: 'deactivateStudent' | 'reactivateStudent'
  /** ban_duration applied first (the desired end state). */
  ban: string
  /** ban_duration restored if the DB update fails afterwards. */
  rollbackBan: string
  /** users-row patch (soft-delete set on deactivate, cleared on reactivate). */
  update: { deleted_at: string | null; deleted_by: string | null }
  failureMessage: string
}

/**
 * Shared two-step status flip: set the auth ban, then write the soft-delete
 * column. If the DB write fails (error or zero rows), the ban is rolled back so
 * auth state and the profile row do not diverge. Best-effort rollback failures
 * are logged. deactivate/reactivate are mirror images of this flow.
 */
async function applyStatusChange({
  id,
  orgId,
  context,
  ban,
  rollbackBan,
  update,
  failureMessage,
}: StatusChange): Promise<ActionResult> {
  const { error: banErr } = await adminClient.auth.admin.updateUserById(id, { ban_duration: ban })
  if (banErr) {
    console.error(`[${context}] Ban toggle error:`, banErr.message)
    return { success: false, error: failureMessage }
  }

  const { data, error: updateErr } = await adminClient
    .from('users')
    .update(update)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id')

  if (updateErr || !data?.length) {
    if (updateErr) console.error(`[${context}] Update error:`, updateErr.message)
    const { error: rollbackErr } = await adminClient.auth.admin.updateUserById(id, {
      ban_duration: rollbackBan,
    })
    if (rollbackErr) {
      console.error(
        `[${context}] Rollback failed — user may be in inconsistent state:`,
        id,
        rollbackErr.message,
      )
    }
    return { success: false, error: failureMessage }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}

export function deactivateStudent(
  id: string,
  adminId: string,
  orgId: string,
): Promise<ActionResult> {
  return applyStatusChange({
    id,
    orgId,
    context: 'deactivateStudent',
    ban: PERMANENT_BAN,
    rollbackBan: NO_BAN,
    update: { deleted_at: new Date().toISOString(), deleted_by: adminId },
    failureMessage: 'Failed to deactivate student',
  })
}

export function reactivateStudent(id: string, orgId: string): Promise<ActionResult> {
  return applyStatusChange({
    id,
    orgId,
    context: 'reactivateStudent',
    ban: NO_BAN,
    rollbackBan: PERMANENT_BAN,
    update: { deleted_at: null, deleted_by: null },
    failureMessage: 'Failed to reactivate student',
  })
}
