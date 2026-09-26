'use server'

import { adminClient } from '@repo/db/admin'
import { CreateStudentSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { requireAdmin } from '@/lib/auth/require-admin'
import { TEMP_PASSWORD_TTL_MS } from '@/lib/auth/temp-password-admin'

export async function createStudent(input: unknown): Promise<ActionResult> {
  const parsed = CreateStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { organizationId, supabase } = await requireAdmin()
  const { email, full_name, role, temporary_password } = parsed.data

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password: temporary_password,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  })

  if (authErr) {
    if (authErr.message.toLowerCase().includes('already registered')) {
      return { success: false, error: 'A user with this email already exists' }
    }
    console.error('[createStudent] Auth user creation failed:', authErr.message)
    return { success: false, error: 'Failed to create student' }
  }

  const inserted = await insertStudentProfile({
    userId: authData.user.id,
    email,
    fullName: full_name,
    role,
    organizationId,
  })
  if (!inserted) return { success: false, error: 'Failed to create student' }

  // Audit the creation via the admin's user-context client (auth.uid() = admin).
  // Best-effort: the student exists, so a failed audit write is logged, not surfaced.
  await recordAuthEvent(supabase, {
    eventType: 'user.created',
    resourceId: authData.user.id,
    context: 'createStudent',
  })

  revalidatePath('/app/admin/students')
  return { success: true }
}

/**
 * Inserts the profile row, armed with a 7-day temp-password expiry. On failure,
 * deletes the just-created Auth user (Auth API + users INSERT cannot share one
 * SQL transaction) and logs if that rollback fails too.
 */
async function insertStudentProfile(opts: {
  userId: string
  email: string
  fullName: string
  role: string
  organizationId: string
}): Promise<boolean> {
  const { error: insertErr } = await adminClient.from('users').upsert(
    {
      id: opts.userId,
      email: opts.email,
      full_name: opts.fullName,
      role: opts.role,
      organization_id: opts.organizationId,
      temp_password_expires_at: new Date(Date.now() + TEMP_PASSWORD_TTL_MS).toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (!insertErr) return true

  console.error('[createStudent] Profile insert failed:', insertErr.message)
  const { error: rollbackErr } = await adminClient.auth.admin.deleteUser(opts.userId)
  if (rollbackErr) {
    console.error(
      '[createStudent] Rollback failed — orphaned auth user:',
      opts.userId,
      rollbackErr.message,
    )
  }
  return false
}
