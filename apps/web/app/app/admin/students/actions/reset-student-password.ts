'use server'

import { adminClient } from '@repo/db/admin'
import { ResetStudentPasswordSchema } from '@repo/db/schema'
import type { createServerSupabaseClient } from '@repo/db/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { requireAdmin } from '@/lib/auth/require-admin'
import { issueTempPassword } from './issue-temp-password'

export async function resetStudentPassword(input: unknown): Promise<ActionResult> {
  const parsed = ResetStudentPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { organizationId, supabase } = await requireAdmin()
  const { id, temporary_password } = parsed.data

  const verifyResult = await verifyStudentInOrg(id, organizationId)
  if (!verifyResult.ok) return verifyResult.error

  return finishStudentPasswordReset(supabase, {
    id,
    temporaryPassword: temporary_password,
    organizationId,
    priorExpiresAt: verifyResult.priorExpiresAt,
  })
}

/** Confirms the student exists, is active, and is in-org; also returns its current temp-password expiry, for a later rollback. */
async function verifyStudentInOrg(
  id: string,
  organizationId: string,
): Promise<{ ok: true; priorExpiresAt: string | null } | { ok: false; error: ActionResult }> {
  const { data: target, error: fetchErr } = await adminClient
    .from('users')
    .select('id, temp_password_expires_at')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .single<{ id: string; temp_password_expires_at: string | null }>()

  if (fetchErr) {
    if (fetchErr.code === 'PGRST116') {
      return { ok: false, error: { success: false, error: 'Student not found' } }
    }
    console.error('[resetStudentPassword] Fetch error:', fetchErr.message)
    return { ok: false, error: { success: false, error: 'Failed to reset password' } }
  }
  if (!target) return { ok: false, error: { success: false, error: 'Student not found' } }
  return { ok: true, priorExpiresAt: target.temp_password_expires_at }
}

/** Issues the new Auth password, audits the change once it took effect, and reports the outcome. */
async function finishStudentPasswordReset(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  opts: {
    id: string
    temporaryPassword: string
    organizationId: string
    priorExpiresAt: string | null
  },
): Promise<ActionResult> {
  const { id, temporaryPassword, organizationId, priorExpiresAt } = opts

  const outcome = await issueTempPassword({
    userId: id,
    organizationId,
    password: temporaryPassword,
    priorExpiresAt,
  })
  if (outcome === 'failed') {
    return { success: false, error: 'Failed to reset password' }
  }

  // Audit via the admin's user-context client (auth.uid() = admin), not adminClient (service role → auth.uid() NULL). Best-effort: failure is logged, not surfaced.
  await recordAuthEvent(supabase, {
    eventType: 'user.password_reset',
    resourceId: id,
    context: 'resetStudentPassword',
  })

  if (outcome === 'issued_not_armed') {
    return {
      success: false,
      error: 'Password was changed but not marked temporary. Reset it again.',
    }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}
