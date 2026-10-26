'use server'

import { adminClient } from '@repo/db/admin'
import { CreateStudentSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { recordAuthEvent } from '@/lib/audit/record-auth-event'
import { requireAdmin } from '@/lib/auth/require-admin'
import { insertStudentProfile } from './create-student-profile'
import { setUserCourses } from './set-user-courses'

export type CreateStudentResult =
  | { success: true; id: string; coursesSaved?: false }
  | { success: false; error: string }

export async function createStudent(input: unknown): Promise<CreateStudentResult> {
  const parsed = CreateStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { organizationId, supabase } = await requireAdmin()
  const { email, full_name, role, course_ids } = parsed.data

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
  })

  if (authErr) {
    if (authErr.code === 'email_exists') {
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

  const coursesOk =
    course_ids.length === 0 || (await setUserCourses(supabase, authData.user.id, course_ids)).ok

  revalidatePath('/app/admin/students')
  return coursesOk
    ? { success: true, id: authData.user.id }
    : { success: true, id: authData.user.id, coursesSaved: false }
}
