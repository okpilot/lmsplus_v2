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

    // Soft-delete the session — only if it belongs to this user and is still active
    // Cast: quiz_sessions.deleted_at exists in DB (migration 023) but not in remote-generated types yet
    const { error: sessionError } = await supabase
      .from('quiz_sessions' as 'users')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', input.sessionId)
      .eq('student_id', user.id)
      .is('ended_at', null)

    if (sessionError) {
      console.error(
        '[discardQuiz] Session soft-delete error:',
        sessionError.message,
        sessionError.code,
        sessionError.details,
      )
      return { success: false, error: 'Failed to discard quiz' }
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
