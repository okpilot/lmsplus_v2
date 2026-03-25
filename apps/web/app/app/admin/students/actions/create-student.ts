'use server'

import { adminClient } from '@repo/db/admin'
import { CreateStudentSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

export async function createStudent(input: unknown): Promise<ActionResult> {
  const parsed = CreateStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { organizationId } = await requireAdmin()
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

  const { error: insertErr } = await adminClient.from('users').insert({
    id: authData.user.id,
    email,
    full_name,
    role,
    organization_id: organizationId,
  })

  if (insertErr) {
    console.error('[createStudent] Profile insert failed:', insertErr.message)
    const { error: rollbackErr } = await adminClient.auth.admin.deleteUser(authData.user.id)
    if (rollbackErr) {
      console.error(
        '[createStudent] Rollback failed — orphaned auth user:',
        authData.user.id,
        rollbackErr.message,
      )
    }
    return { success: false, error: 'Failed to create student' }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}
