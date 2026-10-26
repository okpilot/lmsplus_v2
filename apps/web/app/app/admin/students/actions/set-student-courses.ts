import type { createServerSupabaseClient } from '@repo/db/server'
import { matchRpcError } from '@/lib/rpc-error-match'

export type SetStudentCoursesResult = { ok: true } | { ok: false; error: string }

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Not authenticated',
  not_admin: 'Admin permission required',
  admin_not_found: 'Admin permission required',
  student_not_found: 'Student not found in your organization',
  course_not_found: 'Unknown course',
  invalid_input: 'Invalid input',
}

/** Replaces the student's active enrolments via the admin's user-context client. */
export async function setStudentCourses(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  studentId: string,
  courseIds: string[],
): Promise<SetStudentCoursesResult> {
  const { error } = await supabase.rpc('set_student_enrolments', {
    p_student_id: studentId,
    p_course_ids: courseIds,
  })
  if (!error) return { ok: true }

  console.error('[setStudentCourses] RPC error:', error.message)
  return {
    ok: false,
    error: matchRpcError(error.message, ERROR_MESSAGES) ?? 'Failed to save courses',
  }
}
