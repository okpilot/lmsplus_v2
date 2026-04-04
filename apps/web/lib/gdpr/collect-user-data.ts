import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GdprExportPayload } from './types'

/**
 * Collects all data associated with a user for GDPR export.
 * Works with both user-scoped (RLS) and admin (service-role) clients.
 */
export async function collectUserData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GdprExportPayload> {
  const [
    userResult,
    sessionsResult,
    responsesResult,
    fsrsResult,
    flagsResult,
    commentsResult,
    consentsResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, email, full_name, role, created_at, last_active_at')
      .eq('id', userId)
      .single(),
    supabase
      .from('quiz_sessions')
      .select(
        'id, mode, subject_id, topic_id, total_questions, correct_count, score_percentage, started_at, ended_at',
      )
      .eq('student_id', userId)
      .is('deleted_at', null)
      .order('started_at', { ascending: false }),
    supabase
      .from('student_responses')
      .select(
        'question_id, selected_option_id, is_correct, response_time_ms, session_id, created_at',
      )
      .eq('student_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('fsrs_cards')
      .select('question_id, state, due, stability, difficulty, reps, lapses, last_review')
      .eq('student_id', userId),
    supabase
      .from('active_flagged_questions')
      .select('question_id, flagged_at')
      .eq('student_id', userId),
    supabase
      .from('question_comments')
      .select('id, question_id, body, created_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_consents')
      .select('document_type, document_version, accepted, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('audit_events')
      .select('event_type, resource_type, resource_id, ip_address, created_at')
      .eq('actor_id', userId)
      .order('created_at', { ascending: false }),
  ])

  if (userResult.error || !userResult.data) {
    throw new Error('User not found')
  }

  // Log query errors — GDPR export must be complete, not silently partial
  const queryResults = [
    ['quiz_sessions', sessionsResult],
    ['student_responses', responsesResult],
    ['fsrs_cards', fsrsResult],
    ['flagged_questions', flagsResult],
    ['question_comments', commentsResult],
    ['user_consents', consentsResult],
    ['audit_events', auditResult],
  ] as const
  for (const [table, result] of queryResults) {
    if ('error' in result && result.error) {
      console.error(`[collectUserData] ${table} query failed:`, result.error.message)
    }
  }

  // Phase 2: fetch quiz answers using session IDs from phase 1
  const sessionIds = (sessionsResult.data ?? []).map((s) => s.id)
  const answersResult =
    sessionIds.length > 0
      ? await supabase
          .from('quiz_session_answers')
          .select(
            'session_id, question_id, selected_option_id, is_correct, response_time_ms, answered_at',
          )
          .in('session_id', sessionIds)
          .order('answered_at', { ascending: false })
      : { data: [] as never[] }

  if ('error' in answersResult && answersResult.error) {
    console.error(
      '[collectUserData] quiz_session_answers query failed:',
      answersResult.error.message,
    )
  }

  return {
    exported_at: new Date().toISOString(),
    user: userResult.data,
    quiz_sessions: sessionsResult.data ?? [],
    quiz_answers: answersResult.data ?? [],
    student_responses: responsesResult.data ?? [],
    fsrs_cards: fsrsResult.data ?? [],
    // View columns typed nullable (Postgres artifact); safe to cast — underlying table has NOT NULL constraints.
    flagged_questions: (flagsResult.data ?? []) as { question_id: string; flagged_at: string }[],
    question_comments: commentsResult.data ?? [],
    user_consents: consentsResult.data ?? [],
    audit_events: (auditResult.data ?? []).map((e) => ({
      ...e,
      ip_address: typeof e.ip_address === 'string' ? e.ip_address : null,
    })),
  }
}
