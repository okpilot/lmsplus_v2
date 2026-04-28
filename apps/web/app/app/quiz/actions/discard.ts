'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'

const DiscardQuizInput = z.object({
  sessionId: z.uuid(),
  draftId: z.uuid().optional(),
})

export async function discardQuiz(
  raw: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
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
    if (existing.mode === 'internal_exam') {
      console.error(
        '[discardQuiz] Rejected internal_exam discard for session',
        input.sessionId,
        'user',
        user.id,
      )
      return { success: false, error: 'cannot_discard_internal_exam' }
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

    // Hard-delete the associated draft if one exists (quiz_drafts has no deleted_at column)
    if (input.draftId) {
      const { error: draftError } = await supabase
        .from('quiz_drafts')
        .delete()
        .eq('id', input.draftId)
        .eq('student_id', user.id)

      if (draftError) {
        console.error('[discardQuiz] Draft cleanup error:', draftError.message)
        // Non-fatal: session was already discarded, proceed
      }
    }

    return { success: true }
  } catch (err) {
    console.error('[discardQuiz] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
