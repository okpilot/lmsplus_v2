'use server'

import { adminClient } from '@repo/db/admin'
import { ResetStudentPasswordSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { requireAdmin } from '@/lib/auth/require-admin'

export async function resetStudentPassword(input: unknown): Promise<ActionResult> {
  const parsed = ResetStudentPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { organizationId, supabase } = await requireAdmin()
  const { id, temporary_password } = parsed.data

  const { data: target, error: fetchErr } = await adminClient
    .from('users')
    .select('id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .single<{ id: string }>()

  if (fetchErr) {
    if (fetchErr.code === 'PGRST116') {
      return { success: false, error: 'Student not found' }
    }
    console.error('[resetStudentPassword] Fetch error:', fetchErr.message)
    return { success: false, error: 'Failed to reset password' }
  }

  if (!target) {
    return { success: false, error: 'Student not found' }
  }

  const { error } = await adminClient.auth.admin.updateUserById(id, {
    password: temporary_password,
    user_metadata: { must_change_password: true },
  })

  if (error) {
    console.error('[resetStudentPassword] Password reset error:', error.message)
    return { success: false, error: 'Failed to reset password' }
  }

  // Audit the admin reset via the admin's user-context client (auth.uid() = admin),
  // not adminClient (service role → auth.uid() NULL). Best-effort: the password is
  // already reset, so a failed audit write is logged, not surfaced to the admin.
  await recordAuthEvent(supabase, {
    eventType: 'user.password_reset',
    resourceId: id,
    context: 'resetStudentPassword',
  })

  revalidatePath('/app/admin/students')
  return { success: true }
}
