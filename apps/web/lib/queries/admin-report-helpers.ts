import { adminClient } from '@repo/db/admin'
import type { createServerSupabaseClient } from '@repo/db/server'
import { fetchAllRows, toPageResult } from '@/lib/supabase-paginate'
import { fetchAllRpcRows } from '@/lib/supabase-rpc'
import { type AnswerKeyRow, buildAnswerKeyMap } from './quiz-report-helpers'
import type { AnswerKeyEntry, AnswerRow, QuestionRow } from './report-question-builder'

// Both createServerClient (@supabase/ssr) and createClient (@supabase/supabase-js)
// return SupabaseClient<Database, 'public'> — structurally identical, so this alias
// accepts the auth (SSR) client passed in by callers (see resolve-subject-info.ts).
type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Fetch a quiz_sessions row scoped to the admin's organization, soft-delete
 * filtered. Every admin report entry point runs this exact shape before doing
 * anything else, differing only in the selected columns and the caller's log
 * prefix (derive the current set: grep this function's name). The `ended_at`
 * completed-session guard stays with each caller, since callers differ in what
 * they return on a not-found/not-completed session.
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
 * 500 questions (quick_quiz cap), so the row count is per-blank — exceeding PostgREST's
 * max_rows cap. A single .select() would silently truncate, so this pages
 * through fetchAllRows. `select`/`orderColumns` are parameters precisely so callers
 * needing different columns or sort keys share one paging implementation rather
 * than copying it.
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
      // an opaque error-marker type. toPageResult casts at that boundary AND rejects a
      // non-array payload. A table query cannot resolve a scalar or object the way an RPC
      // can, but it CAN resolve null — and null is the harmful case, not a benign one:
      // every page fetched here lies within [0, total), so a null page is a count/page
      // disagreement, and fetchAllRows' `if (data) all.push(...data)` would skip it and
      // return a short list that reads as complete.
      const { data, error } = await query.range(from, to)
      return toPageResult<T>(data, error, 'quiz_session_answers')
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
  // Same disposition as fetchAllRpcRows: coercing a non-array to [] would hand the
  // caller an empty map with error: null, i.e. a SUCCESSFUL report showing no correct
  // answers. A set-returning RPC serializes an empty result as [], so anything else is
  // a contract breach worth surfacing. (No paging here — one row per MC question, and
  // the session question cap keeps that under max_rows.)
  if (!Array.isArray(correctData)) {
    const got = correctData === null ? 'null' : typeof correctData
    return {
      data: new Map(),
      error: { message: `get_admin_report_correct_options: expected an array, got ${got}` },
    }
  }
  const correctRows = correctData as { question_id: string; correct_option_id: string }[]
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
 * generated database types, so this routes through the fetchAllRpcRows<T>()
 * wrapper — it invokes `.rpc` on the client directly, preserving the
 * `this`-binding (see lib/supabase-rpc.ts), and pages past PostgREST's max_rows
 * cap (500 questions per session, each contributing one row per blank/slot/zone). TODO:
 * drop the explicit type arg once packages/db types are regenerated. Runs on the
 * auth client — adminClient has no auth.uid() context.
 */
export async function fetchAdminReportAnswerKeyMap(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ data: Map<string, AnswerKeyEntry>; error: { message: string } | null }> {
  const { data: answerKeyRows, error: keyError } = await fetchAllRpcRows<AnswerKeyRow>({
    supabase,
    fn: 'get_admin_report_answer_keys',
    args: { p_session_id: sessionId },
    orderColumns: ['question_id', 'blank_index'],
  })
  if (keyError) return { data: new Map(), error: keyError }
  return { data: buildAnswerKeyMap(answerKeyRows), error: null }
}
