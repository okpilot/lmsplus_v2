import type { getAdminClient } from '../../helpers/supabase'

type AdminClient = ReturnType<typeof getAdminClient>

/**
 * Soft-deletes every open (ended_at and deleted_at NULL) quiz_sessions row of `studentId`, so the
 * single-active-session invariant never blocks the next fixture. Logs only when rows changed.
 */
export async function clearOpenSessions(
  admin: AdminClient,
  studentId: string,
  tag: string,
): Promise<void> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .is('ended_at', null)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`clearOpenSessions: ${error.message}`)
  if ((data?.length ?? 0) > 0) console.info(`[${tag}] cleared ${data?.length} session(s)`)
}
