'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import { cleanupDiscardedDraft, discardBlockedError } from './_discard-guard'

const DiscardQuizInput = z.object({
  sessionId: z.uuid(),
  draftId: z.uuid().optional(),
})

export async function discardQuiz(raw: unknown): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    let input: { sessionId: string; draftId?: string }
    try {
      input = DiscardQuizInput.parse(raw)
    } catch {
      return { success: false, error: 'Invalid input' }
    }

    // Pre-fetch the session to verify ownership and check mode before any UPDATE.
    // Internal exams are protected: even if a UI bug exposes a discard button,
    // the server rejects the action.
    const { data: existing, error: fetchError } = await supabase
      .from('quiz_sessions')
      .select('id, mode')
      .eq('id', input.sessionId)
      .eq('student_id', user.id)
      .is('ended_at', null)
      .is('deleted_at', null)
      .maybeSingle()

    if (fetchError) {
      console.error('[discardQuiz] Session lookup error:', fetchError.message, fetchError.code)
      return { success: false, error: 'Failed to discard quiz' }
    }
    if (!existing) {
      return { success: false, error: 'Session not found or already discarded' }
    }
    const blockedError = discardBlockedError(existing.mode)
    if (blockedError) {
      console.error(
        '[discardQuiz] Rejected',
        existing.mode,
        'discard for session',
        input.sessionId,
        'user',
        user.id,
      )
      return { success: false, error: blockedError }
    }

    // Soft-delete the session — only if it belongs to this user and is still active
    const { data: sessionData, error: sessionError } = await supabase
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', input.sessionId)
      .eq('student_id', user.id)
      .is('ended_at', null)
      .select('id')

    if (sessionError) {
      console.error(
        '[discardQuiz] Session soft-delete error:',
        sessionError.message,
        sessionError.code,
        sessionError.details,
      )
      return { success: false, error: 'Failed to discard quiz' }
    }
    if (!sessionData?.length) {
      return { success: false, error: 'Session not found or already discarded' }
    }
    console.log(
      '[discardQuiz] Success — session',
      input.sessionId,
      'soft-deleted for user',
      user.id,
    )

    if (input.draftId) await cleanupDiscardedDraft(supabase, input.draftId, user.id)

    return { success: true }
  } catch (err) {
    console.error('[discardQuiz] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
