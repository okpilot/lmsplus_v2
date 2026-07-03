'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import { closePracticeSessionForDraft } from './draft-helpers'
import { loadResumeContext, mapResumeRpcError, repointDraftSession } from './resume-helpers'

const ResumeInput = z.object({ draftId: z.uuid() })

export type ResumeQuizResult =
  | { success: true; sessionId: string; questionIds: string[] }
  | { success: false; error: string }

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

    // Auto-heal legacy drafts whose original session is still active (pre-#1085 saves
    // never closed it). No-op for post-fix drafts (already soft-deleted). Must precede
    // start — start_quiz_session blocks on ANY active session, incl. this draft's own.
    await closePracticeSessionForDraft(supabase, ctx.oldSessionId, user.id)

    const { data: newSessionId, error: rpcErr } = await rpc<string>(
      supabase,
      'start_quiz_session',
      {
        p_mode: ctx.mode,
        p_subject_id: ctx.subjectId,
        p_topic_id: ctx.topicId,
        p_question_ids: ctx.questionIds,
      },
    )
    if (rpcErr || !newSessionId) {
      console.error('[resumeQuizSession] start RPC error:', rpcErr?.message)
      // Draft is left intact; the caller does not navigate on failure.
      return { success: false, error: mapResumeRpcError(rpcErr?.message) }
    }

    await repointDraftSession(supabase, input.draftId, user.id, ctx, newSessionId)
    return { success: true, sessionId: newSessionId, questionIds: ctx.questionIds }
  } catch (err) {
    console.error('[resumeQuizSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
