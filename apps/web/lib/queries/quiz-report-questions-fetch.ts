import type { createServerSupabaseClient } from '@repo/db/server'
import { fetchAllRpcRows } from '@/lib/supabase-rpc'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export function selectPageAnswers(
  supabase: SupabaseClient,
  sessionId: string,
  questionIds: string[],
) {
  return supabase
    .from('quiz_session_answers')
    .select(
      'question_id, selected_option_id, is_correct, response_time_ms, response_text, blank_index',
    )
    .eq('session_id', sessionId)
    .in('question_id', questionIds)
    .order('answered_at', { ascending: true })
    .order('id')
}

// Precondition: the caller has passed the session ownership + ended_at guard
// (loadReportSession); without it this direct SELECT would expose options and
// explanations mid-session. options carries no answer key — `correct` is stripped at the DB
// write layer (#823); the report's correct option comes from get_report_correct_options.
// No deleted_at filter here: the tenant_isolation SELECT policy on questions (RLS)
// already excludes soft-deleted rows, so a soft-deleted question is absent from the report.
export function selectPageQuestions(supabase: SupabaseClient, questionIds: string[]) {
  return supabase
    .from('questions')
    .select(
      'id, question_text, question_number, options, explanation_text, explanation_image_url, question_image_url, question_type',
    )
    .in('id', questionIds)
}

// Non-MC answer keys (short_answer canonical, dialog_fill per-blank, ordering
// per-slot, diagram_label per-zone). Zero rows for an all-MC session (e.g.
// internal_exam) — not an error. fetchAllRpcRows pages past PostgREST's
// max_rows cap, which one session can exceed at 500 questions each contributing
// one row per blank/slot/zone; see its docblock in lib/supabase-rpc.ts.
export function fetchAnswerKeys(supabase: SupabaseClient, sessionId: string) {
  return fetchAllRpcRows({
    supabase,
    fn: 'get_report_answer_keys',
    args: { p_session_id: sessionId },
    orderColumns: ['question_id', 'blank_index'],
  })
}
