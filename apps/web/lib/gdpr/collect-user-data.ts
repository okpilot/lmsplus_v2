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
import { fetchUserProgress } from './collect-user-progress-query'
import type { GdprExportPayload, GdprExportWarning } from './types'

// User-safe wording for a failed section — surfaced in the export's `warnings`. The raw
// DB error is logged server-side only (see callers), never returned to the data subject.
const SECTION_FAILED_MESSAGE =
  'This section could not be exported in full and may be incomplete. Please retry the export or contact support.'

/**
 * Logs each failed sub-read server-side and returns a machine-readable warning per
 * failure. A failed read yields an EMPTY section (fetchAllRows discards partial pages on
 * error), so without a warning the export would look complete while silently missing a
 * section — the #668 failure mode, which for a legal GDPR export is unacceptable.
 */
function collectSectionWarnings(
  results: ReadonlyArray<readonly [string, { error: { message: string } | null }]>,
): GdprExportWarning[] {
  const warnings: GdprExportWarning[] = []
  for (const [section, result] of results) {
    if (result.error) {
      console.error(`[collectUserData] ${section} query failed:`, result.error.message)
      warnings.push({ section, message: SECTION_FAILED_MESSAGE })
    }
  }
  return warnings
}

type QueryError = { message: string } | null

async function fetchPrimarySections(supabase: SupabaseClient<Database>, userId: string) {
  const [user, sessions, responses, fsrs, flags, comments, consents, audit, progress] =
    await Promise.all([
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
      fetchUserProgress(supabase, userId),
    ])
  return { user, sessions, responses, fsrs, flags, comments, consents, audit, progress }
}

/**
 * Phase 2: session-scoped answers, keyed by the export's own (non-discarded) session ids so the
 * answers section covers exactly the sessions listed in `quiz_sessions`.
 */
async function fetchSessionScopedSections(
  supabase: SupabaseClient<Database>,
  sessionIds: string[],
) {
  if (sessionIds.length === 0) {
    return { answers: { data: [], error: null as QueryError } }
  }
  return { answers: await fetchUserSessionAnswers(supabase, sessionIds) }
}

// View columns are typed nullable (Postgres view artifact); the backing table enforces NOT NULL,
// so this filter drops nothing in practice. If a future view change (e.g. a LEFT JOIN) introduces
// nulls, the dropped rows would silently shorten a legal export — the #668 failure mode — so log
// the count when it happens rather than returning a short section that looks complete.
function keepCompleteFlags(
  rows: ReadonlyArray<{ question_id: string | null; flagged_at: string | null }>,
) {
  const kept = rows.filter(
    (f): f is { question_id: string; flagged_at: string } =>
      typeof f.question_id === 'string' && typeof f.flagged_at === 'string',
  )
  if (kept.length < rows.length) {
    console.error(
      `[collectUserData] flagged_questions: dropped ${rows.length - kept.length} row(s) with null fields — view drift?`,
    )
  }
  return kept
}

type Primary = Awaited<ReturnType<typeof fetchPrimarySections>>
type Scoped = Awaited<ReturnType<typeof fetchSessionScopedSections>>

// A failed read returns an EMPTY section (fetchAllRows discards partial pages on error); the
// export still returns rather than hard-failing so a transient outage never denies the data
// subject access. Each failure is logged AND recorded in `warnings` (#668).
function buildWarnings(r: Primary, scoped: Scoped): GdprExportWarning[] {
  const warnings = collectSectionWarnings([
    ['quiz_sessions', r.sessions],
    ['student_responses', r.responses],
    ['fsrs_cards', r.fsrs],
    ['flagged_questions', r.flags],
    ['question_comments', r.comments],
    ['user_consents', r.consents],
    ['audit_events', r.audit],
  ])
  if (scoped.answers.error) {
    console.error(
      '[collectUserData] quiz_session_answers query failed:',
      scoped.answers.error.message,
    )
    warnings.push({ section: 'quiz_answers', message: SECTION_FAILED_MESSAGE })
  }
  if (r.progress.error) {
    console.error('[collectUserData] quiz_progress query failed:', r.progress.error.message)
    warnings.push({ section: 'quiz_progress', message: SECTION_FAILED_MESSAGE })
  }
  return warnings
}

function buildPayload(
  r: Primary,
  scoped: Scoped,
  user: GdprExportPayload['user'],
): GdprExportPayload {
  return {
    exported_at: new Date().toISOString(),
    warnings: buildWarnings(r, scoped),
    user,
    quiz_sessions: r.sessions.data,
    quiz_answers: scoped.answers.data,
    quiz_progress: r.progress.data,
    student_responses: r.responses.data,
    fsrs_cards: r.fsrs.data,
    flagged_questions: keepCompleteFlags(r.flags.data),
    question_comments: r.comments.data,
    user_consents: r.consents.data,
    audit_events: r.audit.data.map((e) => ({
      ...e,
      ip_address: typeof e.ip_address === 'string' ? e.ip_address : null,
    })),
  }
}

/**
 * Collects all data associated with a user for GDPR export.
 * Works with both user-scoped (RLS) and admin (service-role) clients.
 */
export async function collectUserData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GdprExportPayload> {
  const r = await fetchPrimarySections(supabase, userId)
  if (r.user.error || !r.user.data) throw new Error('User not found')

  // The sessions-read error guard also protects .map() if a future refactor returns data: null.
  const sessionIds = r.sessions.error ? [] : r.sessions.data.map((s) => s.id)
  const scoped = await fetchSessionScopedSections(supabase, sessionIds)
  return buildPayload(r, scoped, r.user.data)
}
