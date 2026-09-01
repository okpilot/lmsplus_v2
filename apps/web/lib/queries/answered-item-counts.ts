import { adminClient } from '@repo/db/admin'
import { fetchAllRows, toPageResult } from '@/lib/supabase-paginate'

type SessionIdRow = { session_id: string }

/**
 * Count answered ITEMS (quiz_session_answers rows) per quiz session, for a page
 * of sessions at once (#990). An "item" is one answer row — a dialog_fill,
 * ordering, or diagram_label question contributes one row PER BLANK/SLOT/ZONE,
 * so this is >= the distinct-question count a report-level helper would report.
 * Two admin list surfaces need this item-level denominator for a whole page of
 * sessions; the sibling `fetchSessionAnswerRows` (admin-report-helpers.ts) only
 * fetches rows for ONE session.
 *
 * fetchAllRows is mandatory, not optional: a plain `.in()` select truncates at
 * PostgREST's max_rows cap (POSTGREST_MAX_ROWS, 1000), and a page of 25 sessions'
 * worth of answer rows routinely exceeds that — an un-paged read would silently
 * under-count.
 *
 * A session with zero answer rows is simply absent from the returned Map — it is
 * never pre-seeded with zeros, so callers must treat a missing key as 0.
 */
export async function fetchAnsweredItemCounts(
  sessionIds: string[],
): Promise<{ data: Map<string, number>; error: { message: string } | null }> {
  if (sessionIds.length === 0) return { data: new Map(), error: null }

  const { data: rows, error } = await fetchAllRows<SessionIdRow>(
    () =>
      adminClient
        .from('quiz_session_answers')
        .select('*', { count: 'exact', head: true })
        .in('session_id', sessionIds),
    async (from, to) => {
      const { data, error } = await adminClient
        .from('quiz_session_answers')
        .select('session_id')
        .in('session_id', sessionIds)
        .order('id', { ascending: true })
        .range(from, to)
      return toPageResult<SessionIdRow>(data, error, 'quiz_session_answers')
    },
  )
  // Never a partial Map on error — a truncated count would silently under-state a
  // denominator, the exact defect class this helper exists to prevent.
  if (error) return { data: new Map(), error }

  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1)
  }
  return { data: counts, error: null }
}
