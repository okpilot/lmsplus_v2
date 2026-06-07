'use server'

import { adminClient } from '@repo/db/admin'
import { ToggleStudentStatusSchema } from '@repo/db/schema'
import type { ActionResult } from '@/lib/action-result'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { requireAdmin } from '@/lib/auth/require-admin'
import { deactivateStudent, reactivateStudent } from './toggle-student-status-mutations'

export async function toggleStudentStatus(input: unknown): Promise<ActionResult> {
  const parsed = ToggleStudentStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { userId, organizationId, supabase } = await requireAdmin()
  const { id } = parsed.data

  if (id === userId) {
    return { success: false, error: 'Cannot deactivate your own account' }
  }

  const { data: target, error: fetchErr } = await adminClient
    .from('users')
    .select('id, deleted_at')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single<{ id: string; deleted_at: string | null }>()

  if (fetchErr) {
    if (fetchErr.code === 'PGRST116') {
      return { success: false, error: 'Student not found' }
    }
    console.error('[toggleStudentStatus] Fetch error:', fetchErr.message)
    return { success: false, error: 'Failed to update student status' }
  }

  if (target.deleted_at === null) {
    const result = await deactivateStudent(id, userId, organizationId)
    if (result.success) {
      // Audit via the admin's user-context client (auth.uid() = admin). Best-effort:
      // the student is deactivated, so a failed audit write is logged, not surfaced.
      await recordAuthEvent(supabase, {
        eventType: 'user.deactivated',
        resourceId: id,
        context: 'toggleStudentStatus',
      })
    }
    return result
  }
  return await reactivateStudent(id, organizationId)
}
