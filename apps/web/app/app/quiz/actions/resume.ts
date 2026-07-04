'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import { closePracticeSessionForDraft } from './draft-helpers'
import { mapResumeRpcError } from './resume-error-messages'
import { loadResumeContext, type ResumeContext, repointDraftSession } from './resume-helpers'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

const ResumeInput = z.object({ draftId: z.uuid() })

export type ResumeQuizResult =
  | { success: true; sessionId: string; questionIds: string[] }
  | { success: false; error: string }

/**
 * Mint the fresh practice session for a resume: auto-heal the draft's original session
 * (soft-delete it if a legacy pre-#1085 draft left it active — a true no-op for a post-fix
 * draft, whose session is already parked), then call start_quiz_session with the draft's
 * exact questions. Must precede any re-point: start_quiz_session blocks on ANY active
 * session, including this draft's own, so the heal has to run first.
 */
async function startResumedSession(
  supabase: SupabaseClient,
  ctx: ResumeContext,
  userId: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  // The heal is intentionally UNCONDITIONAL and runs before the start: if start_quiz_session
  // then fails (e.g. another_session_active), the original practice session stays parked and
  // no new one is minted — which is the desired end state (the draft is intact; a retry
  // re-reads the parked row and re-mints). Do NOT reorder the heal after a successful mint —
  // that would leave this draft's own session active and deadlock start on another_session_active.
  await closePracticeSessionForDraft(supabase, ctx.oldSessionId, userId)

  const { data: newSessionId, error: rpcErr } = await rpc<string>(supabase, 'start_quiz_session', {
    p_mode: ctx.mode,
    p_subject_id: ctx.subjectId,
    p_topic_id: ctx.topicId,
    p_question_ids: ctx.questionIds,
  })
  if (rpcErr || !newSessionId) {
    console.error('[resumeQuizSession] start RPC error:', rpcErr?.message)
    return { ok: false, error: mapResumeRpcError(rpcErr?.message) }
  }
  return { ok: true, sessionId: newSessionId }
}

/**
 * Resume a saved draft by minting a FRESH practice session from the draft's exact
 * questions (#1085). A saved draft is parked state with no active session; resuming
 * recreates one rather than reusing the stale (soft-deleted) original session id.
 */
export async function resumeQuizSession(raw: unknown): Promise<ResumeQuizResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    let input: { draftId: string }
    try {
      input = ResumeInput.parse(raw)
    } catch {
      return { success: false, error: 'Invalid input' }
    }

    const loaded = await loadResumeContext(supabase, input.draftId, user.id)
    if (!loaded.ok) return { success: false, error: loaded.error }
    const { ctx } = loaded

    // Mint the fresh session (auto-heals a legacy draft's stale session first). On failure
    // the draft is left intact and the caller does not navigate.
    const started = await startResumedSession(supabase, ctx, user.id)
    if (!started.ok) return { success: false, error: started.error }

    await repointDraftSession(supabase, input.draftId, user.id, ctx, started.sessionId)
    return { success: true, sessionId: started.sessionId, questionIds: ctx.questionIds }
  } catch (err) {
    console.error('[resumeQuizSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
