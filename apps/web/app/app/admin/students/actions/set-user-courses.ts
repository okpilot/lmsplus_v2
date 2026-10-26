import type { createServerSupabaseClient } from '@repo/db/server'
import { matchRpcError } from '@/lib/rpc-error-match'

export type SetUserCoursesResult = { ok: true } | { ok: false; error: string }

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Not authenticated',
  not_admin: 'Admin permission required',
  admin_not_found: 'Admin permission required',
  user_not_found: 'User not found in your organization',
  course_not_found: 'Unknown course',
  invalid_input: 'Invalid input',
}

/** Replaces the user's active enrolments via the admin's user-context client. */
export async function setUserCourses(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  courseIds: string[],
): Promise<SetUserCoursesResult> {
  const { error } = await supabase.rpc('set_user_enrolments', {
    p_user_id: userId,
    p_course_ids: courseIds,
  })
  if (!error) return { ok: true }

  console.error('[setUserCourses] RPC error:', error.message)
  return {
    ok: false,
    error: matchRpcError(error.message, ERROR_MESSAGES) ?? 'Failed to save courses',
  }
}
