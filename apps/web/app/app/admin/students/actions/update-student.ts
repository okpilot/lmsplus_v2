'use server'

import { adminClient } from '@repo/db/admin'
import { UpdateStudentSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

export async function updateStudent(input: unknown): Promise<ActionResult> {
  const parsed = UpdateStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { organizationId } = await requireAdmin()
  const { id, full_name, role } = parsed.data

  const { data, error } = await adminClient
    .from('users')
    .update({ full_name, role })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[updateStudent] Update error:', error.message)
    return { success: false, error: 'Failed to update student' }
  }

  if (!data?.length) {
    return { success: false, error: 'Student not found' }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}
