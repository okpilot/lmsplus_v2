'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { loadResumeContext, repointDraftSession, startResumedSession } from './resume-helpers'

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
