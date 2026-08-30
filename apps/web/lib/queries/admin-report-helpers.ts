import { adminClient } from '@repo/db/admin'
import type { createServerSupabaseClient } from '@repo/db/server'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { rpc } from '@/lib/supabase-rpc'
import { type AnswerKeyRow, buildAnswerKeyMap } from './quiz-report-helpers'
import type { AnswerKeyEntry, AnswerRow, QuestionRow } from './report-question-builder'

// Both createServerClient (@supabase/ssr) and createClient (@supabase/supabase-js)
// return SupabaseClient<Database, 'public'> — structurally identical, so this alias
// accepts the auth (SSR) client passed in by callers (see resolve-subject-info.ts).
type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Fetch a quiz_sessions row scoped to the admin's organization, soft-delete
 * filtered. Both admin report entry points (`getAdminQuizReportSummary` and
 * `getAdminQuizReportQuestions`) run this exact shape before doing anything
 * else, differing only in the selected columns and the caller's log prefix —
 * the `ended_at` completed-session guard stays with each caller, since the two
 * differ in what they return on a not-found/not-completed session.
 */
export async function fetchAdminSessionForReport<T>(opts: {
  sessionId: string
  organizationId: string
  select: string
  logPrefix: string
}): Promise<{ data: T | null; error: { message: string } | null }> {
  const { sessionId, organizationId, select, logPrefix } = opts
  const { data, error } = await adminClient
    .from('quiz_sessions')
    .select(select)
    .eq('id', sessionId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.error(`${logPrefix} Session query error:`, error.message)
    return { data: null, error }
  }
  return { data: data as T | null, error: null }
}

/**
 * Page through ALL quiz_session_answers rows for a session, on adminClient.
 * A dialog_fill question stores one row per blank, and a session can hold up to
 * 500 questions (quick_quiz cap) x up to 50 blanks — exceeding PostgREST's
 * 1000-row cap. A single .select() would silently truncate, so this pages
 * through fetchAllRows. `select`/`orderColumns` let the two call sites
 * (answered-item counts vs answered-order resolution) share the paging logic
 * while asking for different columns and sort keys.
 */
export async function fetchSessionAnswerRows<T extends { question_id: string }>(opts: {
  sessionId: string
  select: string
  orderColumns: string[]
}): Promise<{ data: T[]; error: { message: string } | null }> {
  const { sessionId, select, orderColumns } = opts
  return fetchAllRows<T>(
    () =>
      adminClient
        .from('quiz_session_answers')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId),
    async (from, to) => {
      let query = adminClient
        .from('quiz_session_answers')
        .select(select)
        .eq('session_id', sessionId)
      for (const column of orderColumns) {
        query = query.order(column, { ascending: true })
      }
      // A non-literal `select` string defeats Supabase's column-typed select() overload
      // (it can't verify columns at compile time), so the resolved row type collapses to
      // an opaque error-marker type. Cast at the boundary — same pattern as the
      // Array.isArray guards elsewhere in this module and in admin-quiz-report.ts.
      const { data, error } = await query.range(from, to)
      return { data: data as unknown as T[] | null, error }
    },
  )
}

/**
 * Fetch the answer rows for one report page, scoped to a session and a page's
 * worth of question ids, in first-answered order.
 */
export async function fetchPageAnswerRows(
  sessionId: string,
  pageQuestionIds: string[],
): Promise<{ data: AnswerRow[]; error: { message: string } | null }> {
  const { data, error } = await adminClient
    .from('quiz_session_answers')
    .select(
      'question_id, selected_option_id, is_correct, response_time_ms, response_text, blank_index',
    )
    .eq('session_id', sessionId)
    .in('question_id', pageQuestionIds)
    .order('answered_at', { ascending: true })
    .order('id')
  if (error) return { data: [], error }
  return { data: Array.isArray(data) ? (data as AnswerRow[]) : [], error: null }
}

/**
 * Fetch the question rows for one report page. options no longer carries the
 * answer key — `correct` is stripped at the DB write layer (#823), so the raw
 * `correct` boolean never reaches this query or buildReportQuestions. The
 * report's correct option comes from get_admin_report_correct_options
 * (correctOptionId). This is admin-only code (requireAdmin + is_admin RPC).
 * PRECONDITION: callers MUST verify `ended_at IS NOT NULL` on the session
 * before calling this — this function does not check session completion.
 * Omits deleted_at intentionally — historical record for completed sessions.
 */
export async function fetchPageQuestions(
  pageQuestionIds: string[],
): Promise<{ data: QuestionRow[]; error: { message: string } | null }> {
  const { data, error } = await adminClient
    .from('questions')
    .select(
      'id, question_text, question_number, options, explanation_text, explanation_image_url, question_image_url, question_type',
    )
    .in('id', pageQuestionIds)
  if (error) return { data: [], error }
  return { data: Array.isArray(data) ? (data as QuestionRow[]) : [], error: null }
}

/**
 * Resolve MC correct-option ids for every answered question in the session, via
 * the admin-only get_admin_report_correct_options RPC. Runs on the auth client —
 * adminClient has no auth.uid() context, and the RPC's is_admin() gate needs it.
 */
export async function fetchAdminReportCorrectOptionsMap(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ data: Map<string, string>; error: { message: string } | null }> {
  const { data: correctData, error: rpcError } = await supabase.rpc(
    'get_admin_report_correct_options',
    { p_session_id: sessionId },
  )
  if (rpcError) return { data: new Map(), error: rpcError }
  const correctRows = Array.isArray(correctData)
    ? (correctData as { question_id: string; correct_option_id: string }[])
    : []
  const correctMap = new Map<string, string>()
  for (const row of correctRows) {
    correctMap.set(row.question_id, row.correct_option_id)
  }
  return { data: correctMap, error: null }
}

/**
 * Resolve non-MC answer keys (short_answer canonical, dialog_fill per-blank
 * canonicals, ordering per-slot canonicals, diagram_label per-zone canonicals)
 * via get_admin_report_answer_keys (migration 20260824000100). Returns zero rows
 * for all-MC sessions (e.g. internal_exam) — not an error. Not yet in the
 * generated database types, so this routes through the rpc<T>() wrapper — it
 * invokes `.rpc` on the client directly, preserving the `this`-binding (see
 * lib/supabase-rpc.ts). TODO: drop the explicit type arg once packages/db types
 * are regenerated. Runs on the auth client — adminClient has no auth.uid() context.
 */
export async function fetchAdminReportAnswerKeyMap(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ data: Map<string, AnswerKeyEntry>; error: { message: string } | null }> {
  const { data: keyData, error: keyError } = await rpc<AnswerKeyRow[]>(
    supabase,
    'get_admin_report_answer_keys',
    { p_session_id: sessionId },
  )
  if (keyError) return { data: new Map(), error: keyError }
  // Runtime guard (code-style §5): only treat an array as rows.
  const answerKeyRows = Array.isArray(keyData) ? keyData : []
  return { data: buildAnswerKeyMap(answerKeyRows), error: null }
}
