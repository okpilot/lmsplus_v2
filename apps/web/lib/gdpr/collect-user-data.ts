import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchUserAuditEvents,
  fetchUserComments,
  fetchUserConsents,
  fetchUserFlaggedQuestions,
  fetchUserFsrsCards,
  fetchUserResponses,
  fetchUserSessionAnswers,
  fetchUserSessions,
} from './collect-user-data-queries'
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
    fetchUserSessions(supabase, userId),
    fetchUserResponses(supabase, userId),
    fetchUserFsrsCards(supabase, userId),
    fetchUserFlaggedQuestions(supabase, userId),
    fetchUserComments(supabase, userId),
    fetchUserConsents(supabase, userId),
    fetchUserAuditEvents(supabase, userId),
  ])

  if (userResult.error || !userResult.data) {
    throw new Error('User not found')
  }

  // A failed read returns an EMPTY section (fetchAllRows discards partial pages on error) and is
  // logged here; the export still returns rather than hard-failing. The #668 failure mode we must
  // avoid is a silently TRUNCATED section that looks complete — an empty + logged section does not.
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
    if (result.error) {
      console.error(`[collectUserData] ${table} query failed:`, result.error.message)
    }
  }

  // Phase 2: fetch quiz answers using session IDs from phase 1
  const sessionIds = sessionsResult.data.map((s) => s.id)
  let answers: GdprExportPayload['quiz_answers'] = []
  let answersError: { message: string } | null = null

  if (sessionIds.length > 0) {
    const answersResult = await fetchUserSessionAnswers(supabase, sessionIds)
    answers = answersResult.data
    answersError = answersResult.error
  }

  if (answersError) {
    console.error('[collectUserData] quiz_session_answers query failed:', answersError.message)
  }

  // View columns are typed nullable (Postgres view artifact); the backing table enforces NOT NULL,
  // so this filter drops nothing in practice. If a future view change (e.g. a LEFT JOIN) introduces
  // nulls, the dropped rows would silently shorten a legal export — the #668 failure mode — so log
  // the count when it happens rather than returning a short section that looks complete.
  const flaggedQuestions = flagsResult.data.filter(
    (f): f is { question_id: string; flagged_at: string } =>
      typeof f.question_id === 'string' && typeof f.flagged_at === 'string',
  )
  if (flaggedQuestions.length < flagsResult.data.length) {
    console.error(
      `[collectUserData] flagged_questions: dropped ${flagsResult.data.length - flaggedQuestions.length} row(s) with null fields — view drift?`,
    )
  }

  return {
    exported_at: new Date().toISOString(),
    user: userResult.data,
    quiz_sessions: sessionsResult.data,
    quiz_answers: answers,
    student_responses: responsesResult.data,
    fsrs_cards: fsrsResult.data,
    flagged_questions: flaggedQuestions,
    question_comments: commentsResult.data,
    user_consents: consentsResult.data,
    audit_events: auditResult.data.map((e) => ({
      ...e,
      ip_address: typeof e.ip_address === 'string' ? e.ip_address : null,
    })),
  }
}
