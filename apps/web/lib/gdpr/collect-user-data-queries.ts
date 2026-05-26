import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase-paginate'
import type { GdprExportPayload } from './types'

export type SessionRow = GdprExportPayload['quiz_sessions'][number]
export type ResponseRow = GdprExportPayload['student_responses'][number]
export type FsrsRow = GdprExportPayload['fsrs_cards'][number]
// View columns typed nullable (Postgres artifact); cast to non-nullable at return site.
export type FlagRow = { question_id: string | null; flagged_at: string | null }
export type CommentRow = GdprExportPayload['question_comments'][number]
export type ConsentRow = GdprExportPayload['user_consents'][number]
export type AuditRow = {
  event_type: string
  resource_type: string
  resource_id: string | null
  ip_address: unknown
  created_at: string
}
export type AnswerRow = GdprExportPayload['quiz_answers'][number]

export function fetchUserSessions(supabase: SupabaseClient<Database>, userId: string) {
  return fetchAllRows<SessionRow>(
    () =>
      supabase
        .from('quiz_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', userId)
        .is('deleted_at', null),
    (from, to) =>
      supabase
        .from('quiz_sessions')
        .select(
          'id, mode, subject_id, topic_id, total_questions, correct_count, score_percentage, started_at, ended_at',
        )
        .eq('student_id', userId)
        .is('deleted_at', null)
        .order('started_at', { ascending: false })
        .order('id')
        .range(from, to),
  )
}

export function fetchUserResponses(supabase: SupabaseClient<Database>, userId: string) {
  return fetchAllRows<ResponseRow>(
    () =>
      supabase
        .from('student_responses')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', userId),
    (from, to) =>
      supabase
        .from('student_responses')
        .select(
          'question_id, selected_option_id, is_correct, response_time_ms, session_id, created_at',
        )
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
  )
}

export function fetchUserFsrsCards(supabase: SupabaseClient<Database>, userId: string) {
  return fetchAllRows<FsrsRow>(
    () =>
      supabase
        .from('fsrs_cards')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', userId),
    (from, to) =>
      supabase
        .from('fsrs_cards')
        .select('question_id, state, due, stability, difficulty, reps, lapses, last_review')
        .eq('student_id', userId)
        .order('id')
        .range(from, to),
  )
}

export function fetchUserFlaggedQuestions(supabase: SupabaseClient<Database>, userId: string) {
  return fetchAllRows<FlagRow>(
    () =>
      supabase
        .from('active_flagged_questions')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', userId),
    (from, to) =>
      supabase
        .from('active_flagged_questions')
        .select('question_id, flagged_at')
        .eq('student_id', userId)
        .order('flagged_at', { ascending: false })
        .order('question_id')
        .range(from, to),
  )
}

export function fetchUserComments(supabase: SupabaseClient<Database>, userId: string) {
  return fetchAllRows<CommentRow>(
    () =>
      supabase
        .from('question_comments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('deleted_at', null),
    (from, to) =>
      supabase
        .from('question_comments')
        .select('id, question_id, body, created_at')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
  )
}

export function fetchUserConsents(supabase: SupabaseClient<Database>, userId: string) {
  return fetchAllRows<ConsentRow>(
    () =>
      supabase
        .from('user_consents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    (from, to) =>
      supabase
        .from('user_consents')
        .select('document_type, document_version, accepted, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
  )
}

export function fetchUserAuditEvents(supabase: SupabaseClient<Database>, userId: string) {
  return fetchAllRows<AuditRow>(
    () =>
      supabase
        .from('audit_events')
        .select('*', { count: 'exact', head: true })
        .eq('actor_id', userId),
    (from, to) =>
      supabase
        .from('audit_events')
        .select('event_type, resource_type, resource_id, ip_address, created_at')
        .eq('actor_id', userId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
  )
}

export async function fetchUserSessionAnswers(
  supabase: SupabaseClient<Database>,
  sessionIds: string[],
): Promise<{ data: AnswerRow[]; error: { message: string } | null }> {
  // sessionIds may exceed 1000 rows (now fully paginated), so chunk into batches of 1000
  // to avoid URI length limits (414) on the .in() filter.
  let answers: AnswerRow[] = []

  for (let i = 0; i < sessionIds.length; i += 1000) {
    const batch = sessionIds.slice(i, i + 1000)
    const { data, error } = await fetchAllRows<AnswerRow>(
      () =>
        supabase
          .from('quiz_session_answers')
          .select('*', { count: 'exact', head: true })
          .in('session_id', batch),
      (from, to) =>
        supabase
          .from('quiz_session_answers')
          .select(
            'session_id, question_id, selected_option_id, is_correct, response_time_ms, answered_at',
          )
          .in('session_id', batch)
          .order('answered_at', { ascending: false })
          .order('id')
          .range(from, to),
    )
    // Discard partial answers on error (mirrors fetchAllRows): a half-fetched answer set must
    // not masquerade as a complete GDPR export section. The caller logs the error.
    if (error) return { data: [], error }
    answers = answers.concat(data)
  }

  return { data: answers, error: null }
}
