// Pure/DB helpers for the resumeQuizSession Server Action. Hoisted out of resume.ts
// to keep the action file under the 100-line cap (code-style.md §1) and each function
// under the 30-line rule (§3). No `'use server'` — these are invoked by the action.
import type { createServerSupabaseClient } from '@repo/db/server'
import type { Database, Json } from '@repo/db/types'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

// RPC error token (from start_quiz_session, mig 20260629000600) → user message.
// Distinct situations get distinct copy: a different active session vs a stale draft.
// INVARIANT: keys must not be substrings of one another — mapResumeRpcError matches via
// token.includes(key), so an overlapping key would make iteration order decide the mapping.
const RESUME_ERROR_MESSAGES: Record<string, string> = {
  another_session_active:
    'You already have an active session. Finish or discard it before resuming this one.',
  // Reachable on resume: the Supabase auth token can outlive a soft-deleted `users` row,
  // so a deactivated account can pass the action's auth check yet hit this RPC guard.
  'user not found or inactive': 'Your account is no longer active.',
  invalid_question_ids:
    'This saved quiz’s questions are no longer available — it may be out of date.',
  no_questions_provided:
    'This saved quiz’s questions are no longer available — it may be out of date.',
  // Unreachable for a draft saved after the schema cap (.max(500)), but mapped for RPC
  // error-token completeness (agent-semantic-reviewer.md) — a legacy row could carry >500 ids.
  too_many_questions:
    'This saved quiz has too many questions and can’t be resumed. Please contact support.',
}

export function mapResumeRpcError(message: string | undefined): string {
  const token = message ?? ''
  for (const [key, msg] of Object.entries(RESUME_ERROR_MESSAGES)) {
    if (token.includes(key)) return msg
  }
  return 'Failed to resume this saved quiz. Please try again.'
}

export type ResumeContext = {
  oldSessionId: string
  questionIds: string[]
  mode: string
  subjectId: string | null
  topicId: string | null
  subjectName?: string
  subjectCode?: string
}

type ContextResult = { ok: true; ctx: ResumeContext } | { ok: false; error: string }

/**
 * Validate that the original session can be recreated via start_quiz_session: practice
 * mode only, and a quick_quiz must carry a subject. Returns a user-facing error string,
 * or null when the session is resumable.
 */
function validateSessionForResume(session: {
  mode: string
  subject_id: string | null
}): string | null {
  // Only practice sessions can be recreated; refuse anything else with clean copy rather
  // than leaking a raw `mode_not_allowed` RPC error.
  if (session.mode !== 'quick_quiz' && session.mode !== 'smart_review') {
    return 'This saved quiz can’t be resumed.'
  }
  // quick_quiz always carries a subject; smart_review may be cross-subject (NULL subject_id),
  // which start_quiz_session accepts. Only quick_quiz is reachable today, but reject a
  // NULL-subject quick_quiz rather than pass a bad arg to the RPC.
  if (session.mode === 'quick_quiz' && !session.subject_id) {
    return 'The original session for this saved quiz is missing its subject.'
  }
  return null
}

/**
 * Load everything resume needs: the draft's question_ids + the ORIGINAL session's
 * mode/subject/topic (read from the session row, which survives the save-time
 * soft-delete because RLS `students_select_sessions` is student_id-only with no
 * deleted_at filter). Sourcing from the row — not client JSONB — avoids trusting
 * unvalidated client state and the multi-topic topic_id=NULL edge case.
 */
export async function loadResumeContext(
  supabase: SupabaseClient,
  draftId: string,
  userId: string,
): Promise<ContextResult> {
  const { data: draft, error: draftErr } = await supabase
    .from('quiz_drafts')
    .select('question_ids, session_config')
    .eq('id', draftId)
    .eq('student_id', userId)
    .maybeSingle()
  if (draftErr) {
    console.error('[resumeQuizSession] Draft lookup error:', draftErr.message)
    return { ok: false, error: 'Failed to resume this saved quiz.' }
  }
  if (!draft) return { ok: false, error: 'Saved quiz not found.' }
  if (!draft.question_ids || draft.question_ids.length === 0) {
    return { ok: false, error: 'This saved quiz has no questions.' }
  }

  const config = (draft.session_config ?? {}) as {
    sessionId?: unknown
    subjectName?: unknown
    subjectCode?: unknown
  }
  if (typeof config.sessionId !== 'string') {
    return { ok: false, error: 'This saved quiz is missing its session reference.' }
  }

  const { data: session, error: sErr } = await supabase
    .from('quiz_sessions')
    .select('mode, subject_id, topic_id')
    .eq('id', config.sessionId)
    .eq('student_id', userId)
    .maybeSingle()
  if (sErr) {
    console.error('[resumeQuizSession] Session lookup error:', sErr.message)
    return { ok: false, error: 'Failed to resume this saved quiz.' }
  }
  if (!session) {
    return { ok: false, error: 'The original session for this saved quiz is unavailable.' }
  }
  const invalid = validateSessionForResume(session)
  if (invalid) return { ok: false, error: invalid }

  return {
    ok: true,
    ctx: {
      oldSessionId: config.sessionId,
      questionIds: draft.question_ids,
      mode: session.mode,
      subjectId: session.subject_id,
      topicId: session.topic_id,
      subjectName: typeof config.subjectName === 'string' ? config.subjectName : undefined,
      subjectCode: typeof config.subjectCode === 'string' ? config.subjectCode : undefined,
    },
  }
}

/**
 * Point the draft at the freshly-minted session id, preserving the subject labels
 * used by the draft card + handoff (session_config is written wholesale, not merged,
 * so a bare `{ sessionId }` would drop the labels). Non-fatal: the new session works
 * this run even if the pointer write fails — the draft self-heals on the next resume.
 */
export async function repointDraftSession(
  supabase: SupabaseClient,
  draftId: string,
  userId: string,
  ctx: ResumeContext,
  newSessionId: string,
): Promise<void> {
  const payload: Database['public']['Tables']['quiz_drafts']['Update'] = {
    session_config: {
      sessionId: newSessionId,
      subjectName: ctx.subjectName,
      subjectCode: ctx.subjectCode,
    } as Json,
  }
  const { data, error } = await supabase
    .from('quiz_drafts')
    .update(payload)
    .eq('id', draftId)
    .eq('student_id', userId)
    .select('id')
  if (error) {
    console.error('[resumeQuizSession] Draft re-point error:', error.message)
    return
  }
  // Non-fatal: a zero-row re-point means the draft self-heals on the next resume, but
  // log it for parity with closePracticeSessionForDraft's §5 observability.
  if ((data?.length ?? 0) === 0) {
    console.error('[resumeQuizSession] Draft re-point matched no row for draft', draftId)
  }
}
