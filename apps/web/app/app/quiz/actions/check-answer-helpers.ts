// Three roles for the checkAnswer Server Action: the session-ownership check, the
// check_quiz_answer call (which reads the answer key), and a runtime guard on its result.
// Hoisted out of check-answer.ts to keep that file under the 100-line cap and checkAnswer
// itself inside the orchestrator boundary (code-style.md §1, §3). The non-MC path splits
// the same way, but across two files — helpers for the ownership check, dispatch for the
// RPC calls; this merges both.
//
// This module must NOT carry 'use server', and the load-bearing reason is not that a sync
// export would forbid it — that obstacle is removable, so do not rely on it. The reason is
// that a 'use server' module publishes every async export as an endpoint, and `gradeAnswer`
// returns `correct_option_id` — the MC answer key that docs/security.md §4 and mig 111's
// column REVOKE exist to protect. Do not make it such a module. (It would not be a working
// bypass today: the injected SupabaseClient is not serializable across the boundary, and the
// RPC self-guards — see gradeAnswer's docblock. That margin is not ours to spend.)
// `CheckAnswerRpcResult` and `isCheckAnswerRpcResult` are file-private for the same reason:
// nothing here should widen the surface by accident.
import type { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'
import type { CheckAnswerResult } from '../types'

// Declared locally, matching draft-helpers.ts, resume-helpers.ts, _discard-guard.ts and
// seven other helpers — the codebase re-declares this one-line derived type rather than
// sharing it.
type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Defense-in-depth session ownership + membership check — the MC twin of
 * verifySessionMembership in check-non-mc-answer-helpers.ts, kept deliberately
 * identical in shape and disposition (docs/security.md §11a). The RPC self-guards; this
 * fails fast on a foreign/closed session or a question outside it.
 *
 * Returns a user-facing error string on failure, null on success. Only PGRST116 (no row)
 * means the session is genuinely gone: `.single()` ERRORS on zero rows rather than
 * returning null, so collapsing every error into 'Session not found' would report a
 * transient DB fault as a dead session.
 */
export async function verifySessionMembership(
  supabase: SupabaseClient,
  opts: { sessionId: string; userId: string; questionId: string },
): Promise<string | null> {
  const { data: session, error } = await supabase
    .from('quiz_sessions')
    .select('config')
    .eq('id', opts.sessionId)
    .eq('student_id', opts.userId)
    .is('ended_at', null)
    .is('deleted_at', null)
    .single()
  if (error) {
    if (error.code === 'PGRST116') {
      console.error('[checkAnswer] Session not found/not owned:', opts.questionId, opts.sessionId)
      return 'Session not found'
    }
    console.error('[checkAnswer] Session lookup error:', error.message, error.code)
    return 'Could not check answer'
  }
  // Defensive floor, unlogged and unreachable: .single() errors rather than returning null.
  if (!session) return 'Session not found'
  const config = (session as unknown as { config: { question_ids: unknown } }).config
  const qIds = config?.question_ids
  if (!Array.isArray(qIds) || !qIds.includes(opts.questionId)) {
    console.error('[checkAnswer] Question not in session:', opts.questionId, opts.sessionId)
    return 'Question not in session'
  }
  return null
}

/**
 * Calls check_quiz_answer and maps its result. Split from the action for the same reason
 * the non-MC path keeps its RPC calls in check-non-mc-answer-dispatch.ts: it leaves
 * checkAnswer a pure orchestrator (auth → validate → authorize → delegate) inside §3's
 * boundary.
 *
 * Callers should run verifySessionMembership first, but the security boundary does not
 * depend on it: mig `20260619000700` (the latest check_quiz_answer — traced through the
 * `20260313000029` DROP+CREATE) self-guards with a strict superset — auth.uid() null
 * check, active-user gate, the same four ownership predicates, a practice-mode-only guard,
 * and its own question_ids membership test, all before the key is read. Skipping the
 * helper costs error granularity, never the guard.
 */
export async function gradeAnswer(
  supabase: SupabaseClient,
  opts: { questionId: string; selectedOptionId: string; sessionId: string },
): Promise<CheckAnswerResult> {
  const { data, error } = await rpc<CheckAnswerRpcResult>(supabase, 'check_quiz_answer', {
    p_question_id: opts.questionId,
    p_selected_option_id: opts.selectedOptionId,
    p_session_id: opts.sessionId,
  })

  if (error || !isCheckAnswerRpcResult(data)) {
    console.error('[checkAnswer] RPC error:', error?.message)
    return { success: false, error: 'Question not found' }
  }

  return {
    success: true,
    isCorrect: data.is_correct,
    correctOptionId: data.correct_option_id,
    explanationText: data.explanation_text,
    explanationImageUrl: data.explanation_image_url,
  }
}

type CheckAnswerRpcResult = {
  is_correct: boolean
  correct_option_id: string
  explanation_text: string | null
  explanation_image_url: string | null
}

function isCheckAnswerRpcResult(value: unknown): value is CheckAnswerRpcResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.is_correct === 'boolean' &&
    typeof v.correct_option_id === 'string' &&
    (v.explanation_text === null || typeof v.explanation_text === 'string') &&
    (v.explanation_image_url === null || typeof v.explanation_image_url === 'string')
  )
}
