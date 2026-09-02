import { fetchAllRows, toPageResult } from '@/lib/supabase-paginate'

type SessionIdRow = { session_id: string }

/**
 * The minimal PostgREST query-builder surface `fetchAnsweredItemCounts` needs on
 * `quiz_session_answers`. Structural, not the real Supabase client type, so both
 * `adminClient` (service-role) and a `createServerSupabaseClient()` result
 * (RLS-scoped) can be passed — see `AnswerCountClient` below. Mirrors
 * `OffsetChainBuilder` in `apps/web/app/app/admin/internal-exams/_offset-query.ts`,
 * which exists for the same reason.
 */
export type AnswerCountChain = {
  select: {
    (cols: string): AnswerCountChain
    (cols: string, opts: { count: 'exact'; head: boolean }): AnswerCountChain
  }
  in: (col: string, vals: string[]) => AnswerCountChain
  order: (col: string, opts: { ascending: boolean }) => AnswerCountChain
  range: (from: number, to: number) => AnswerCountChain
}

export type AnswerCountClient = { from: (table: string) => AnswerCountChain }

/**
 * The count half of the paged read. Its `.in()` filter MUST stay byte-identical to
 * `pageAnswerRows`' — and do NOT rely on `fetchAllRows` to catch it if they drift,
 * because it only catches ONE of the two directions. `fetchAllRows` pages
 * `[0, count)`: if the COUNT side is broader, it requests a range the page side
 * cannot fill and `checkPageCardinality` errors. If the count side is NARROWER,
 * `total` is simply too small, the page query returns exactly the `total` rows
 * asked for, the cardinality check passes, and the result is a silently truncated
 * under-count — the very failure this helper exists to prevent.
 */
function countAnswerRows(
  client: AnswerCountClient,
  sessionIds: string[],
): PromiseLike<{ count: number | null; error: { message: string } | null }> {
  return client
    .from('quiz_session_answers')
    .select('*', { count: 'exact', head: true })
    .in('session_id', sessionIds) as unknown as PromiseLike<{
    count: number | null
    error: { message: string } | null
  }>
}

/** The page half. Same filter as `countAnswerRows`; `.order('id')` keeps paging deterministic. */
async function pageAnswerRows(
  client: AnswerCountClient,
  sessionIds: string[],
  range: { from: number; to: number },
) {
  const { data, error } = await (client
    .from('quiz_session_answers')
    .select('session_id')
    .in('session_id', sessionIds)
    .order('id', { ascending: true })
    .range(range.from, range.to) as unknown as PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>)
  return toPageResult<SessionIdRow>(data, error, 'quiz_session_answers')
}

/**
 * Count answered ITEMS (quiz_session_answers rows) per quiz session, for a page
 * of sessions at once (#990). An "item" is one answer row — a dialog_fill,
 * ordering, or diagram_label question contributes one row PER BLANK/SLOT/ZONE,
 * so this is >= the distinct-question count a report-level helper would report.
 * Two admin list surfaces and the student-facing `/app/reports` list need this
 * item-level denominator; the sibling `fetchSessionAnswerRows`
 * (admin-report-helpers.ts) only fetches rows for ONE session.
 *
 * fetchAllRows is mandatory, not optional: a plain `.in()` select truncates at
 * PostgREST's max_rows cap (POSTGREST_MAX_ROWS, 1000), and a page of 25 sessions'
 * worth of answer rows routinely exceeds that — an un-paged read would silently
 * under-count.
 *
 * A session with zero answer rows is simply absent from the returned Map — it is
 * never pre-seeded with zeros, so callers must treat a missing key as 0.
 *
 * **The caller chooses the client — this is a security-relevant decision, not a
 * convenience default.** Admin surfaces (`.../admin/dashboard/students/[id]`,
 * `.../admin/internal-exams`) pass the service-role `adminClient`, because they
 * read across students the caller doesn't own. The student-facing `/app/reports`
 * list must pass the RLS-scoped client from `createServerSupabaseClient()` —
 * `quiz_session_answers`' `students_read_answers` policy already scopes a
 * student's own rows (`session_id IN (SELECT id FROM quiz_sessions WHERE
 * student_id = auth.uid())`), so passing the RLS-scoped client is both correct
 * and sufficient; passing `adminClient` there would bypass RLS entirely on a
 * student request path. There is deliberately no default parameter — an implicit
 * service-role fallback on a helper reachable from a student path is a footgun.
 */
export async function fetchAnsweredItemCounts(
  sessionIds: string[],
  client: AnswerCountClient,
): Promise<{ data: Map<string, number>; error: { message: string } | null }> {
  if (sessionIds.length === 0) return { data: new Map(), error: null }

  const { data: rows, error } = await fetchAllRows<SessionIdRow>(
    () => countAnswerRows(client, sessionIds),
    (from, to) => pageAnswerRows(client, sessionIds, { from, to }),
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
