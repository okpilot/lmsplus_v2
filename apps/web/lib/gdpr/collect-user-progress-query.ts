import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase-paginate'
import type { GdprExportPayload } from './types'

type ProgressRow = GdprExportPayload['quiz_progress'][number]

/**
 * Reads in-progress quiz answers for the given session ids — the same (non-discarded) sessions
 * the export's session section lists. Mirrors fetchUserSessionAnswers: chunked `.in()` filter,
 * partial data discarded on error (the caller logs it), empty ids issue no query.
 */
export async function fetchUserProgress(
  supabase: SupabaseClient<Database>,
  sessionIds: string[],
): Promise<{ data: ProgressRow[]; error: { message: string } | null }> {
  let rows: ProgressRow[] = []

  for (let i = 0; i < sessionIds.length; i += 1000) {
    const batch = sessionIds.slice(i, i + 1000)
    const { data, error } = await fetchAllRows<ProgressRow>(
      () =>
        supabase
          .from('quiz_session_progress')
          .select('*', { count: 'exact', head: true })
          .in('session_id', batch),
      (from, to) =>
        supabase
          .from('quiz_session_progress')
          .select('session_id, question_id, answer, time_spent_ms, answered_at, updated_at')
          .in('session_id', batch)
          // The composite PK (session_id, question_id) is a total order; no surrogate id column exists.
          .order('session_id')
          .order('question_id')
          .range(from, to),
    )
    if (error) return { data: [], error }
    rows = rows.concat(data)
  }

  return { data: rows, error: null }
}
