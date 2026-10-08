// Pure/DB helpers for the resumeQuizSession Server Action. Hoisted out of resume.ts
// to keep the action file under the 100-line cap (code-style.md §1) and each function
// under the 30-line rule (§3). No `'use server'` — these are invoked by the action.
import type { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { PRACTICE_MODES } from '@/lib/constants/exam-modes'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export type ResumeContext = {
  oldSessionId: string
  questionIds: string[]
  mode: string
  subjectId: string | null
  topicId: string | null
  subjectName?: string
  subjectCode?: string
  // Client-written JSONB; seedSessionFromDraft re-validates every entry.
  answers: unknown
  currentIndex: number
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
  if (!(PRACTICE_MODES as readonly string[]).includes(session.mode)) {
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

type DraftForResume = {
  questionIds: string[]
  sessionId: string
  answers: unknown
  currentIndex: number
  subjectName?: string
  subjectCode?: string
}
type DraftLoadResult = { ok: true; draft: DraftForResume } | { ok: false; error: string }

// Untrusted shape of quiz_drafts.session_config (client-written JSONB) — every field
// is re-narrowed at the read site below before use.
type RawDraftConfig = { sessionId?: unknown; subjectName?: unknown; subjectCode?: unknown }

function toResumeDraft(
  draft: { question_ids: string[]; answers: unknown; current_index: number },
  config: RawDraftConfig,
  sessionId: string,
): DraftForResume {
  return {
    questionIds: draft.question_ids,
    sessionId,
    answers: draft.answers,
    currentIndex: draft.current_index,
    subjectName: typeof config.subjectName === 'string' ? config.subjectName : undefined,
    subjectCode: typeof config.subjectCode === 'string' ? config.subjectCode : undefined,
  }
}

/**
 * Fetch + validate the draft row: its question_ids and the ORIGINAL session id/labels
 * from session_config. Split out of loadResumeContext to keep both under the §3
 * 30-line rule. Sources labels from the draft JSONB (write-once at save) but the
 * session id is re-validated against the session row by the caller.
 */
async function loadDraftForResume(
  supabase: SupabaseClient,
  draftId: string,
  userId: string,
): Promise<DraftLoadResult> {
  const { data: draft, error: draftErr } = await supabase
    .from('quiz_drafts')
    .select('question_ids, session_config, answers, current_index')
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
  const config = (draft.session_config ?? {}) as RawDraftConfig
  const sessionId = z.uuid().safeParse(config.sessionId)
  if (!sessionId.success) {
    return { ok: false, error: 'This saved quiz is missing its session reference.' }
  }
  return { ok: true, draft: toResumeDraft(draft, config, sessionId.data) }
}

type OriginalSession = { mode: string; subject_id: string | null; topic_id: string | null }
type SessionLoadResult = { ok: true; session: OriginalSession } | { ok: false; error: string }

/**
 * Read the draft's ORIGINAL session row (scoped to the caller) and confirm it is
 * resume-eligible (practice mode + subject present). The session row survives the
 * save-time soft-delete because RLS `students_select_sessions` is student_id-only with no
 * deleted_at filter. Split out of loadResumeContext to keep it under the §3 30-line rule.
 */
async function loadOriginalSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<SessionLoadResult> {
  const { data: session, error: sErr } = await supabase
    .from('quiz_sessions')
    .select('mode, subject_id, topic_id')
    .eq('id', sessionId)
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
  return { ok: true, session }
}

/**
 * Load everything resume needs: the draft's question_ids + the ORIGINAL session's
 * mode/subject/topic. Sourcing mode/subject from the session row — not the client-written
 * JSONB — avoids trusting unvalidated client state and the multi-topic topic_id=NULL edge
 * case. Orchestrates loadDraftForResume + loadOriginalSession.
 */
export async function loadResumeContext(
  supabase: SupabaseClient,
  draftId: string,
  userId: string,
): Promise<ContextResult> {
  const draftResult = await loadDraftForResume(supabase, draftId, userId)
  if (!draftResult.ok) return draftResult
  const { questionIds, sessionId, subjectName, subjectCode, answers, currentIndex } =
    draftResult.draft

  const sessionResult = await loadOriginalSession(supabase, sessionId, userId)
  if (!sessionResult.ok) return sessionResult
  const { session } = sessionResult

  return {
    ok: true,
    ctx: {
      oldSessionId: sessionId,
      questionIds,
      mode: session.mode,
      subjectId: session.subject_id,
      topicId: session.topic_id,
      subjectName,
      subjectCode,
      answers,
      currentIndex,
    },
  }
}
