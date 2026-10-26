'use server'

import { adminClient } from '@repo/db/admin'
import { UpdateStudentSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'
import { setUserCourses } from './set-user-courses'

export async function updateStudent(input: unknown): Promise<ActionResult> {
  const parsed = UpdateStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { organizationId, supabase } = await requireAdmin()
  const { id, full_name, role, course_ids } = parsed.data

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

  if (course_ids !== undefined) {
    const courses = await setUserCourses(supabase, id, course_ids)
    if (!courses.ok) {
      revalidatePath('/app/admin/students')
      return {
        success: false,
        error: `Student updated, but courses were not saved: ${courses.error}`,
      }
    }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}
