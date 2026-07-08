import type { createServerSupabaseClient } from '@repo/db/server'

// Both createServerClient (@supabase/ssr) and createClient (@supabase/supabase-js)
// return SupabaseClient<Database, 'public'> — structurally identical, so this alias
// accepts BOTH the SSR client and the service-role adminClient passed by the callers.
type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Resolve a subject's display name + code for a report summary.
 *
 * Display-only: on a lookup error we log and return nulls rather than aborting
 * the report. Shared by getQuizReportSummary (SSR client) and
 * getAdminQuizReportSummary (admin/service-role client); `logPrefix` identifies
 * the caller in the error log.
 */
export async function resolveSubjectInfo(
  client: SupabaseClient,
  subjectId: string | null,
  logPrefix: string,
): Promise<{ subjectName: string | null; subjectCode: string | null }> {
  if (!subjectId) return { subjectName: null, subjectCode: null }
  const { data, error } = await client
    .from('easa_subjects')
    .select('name, code')
    .eq('id', subjectId)
    .maybeSingle()
  if (error) {
    console.error(`${logPrefix} Subject lookup error:`, error.message)
  }
  const subject = data as { name: unknown; code: unknown } | null
  const subjectName = typeof subject?.name === 'string' ? subject.name : null
  const subjectCode = typeof subject?.code === 'string' ? subject.code : null
  return { subjectName, subjectCode }
}
