'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'

const DiscardQuizInput = z.object({
  sessionId: z.string().uuid(),
  draftId: z.string().uuid().optional(),
})

export async function discardQuiz(
  raw: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    let input: { sessionId: string; draftId?: string }
    try {
      input = DiscardQuizInput.parse(raw)
    } catch {
      return { success: false, error: 'Invalid input' }
    }

    // Soft-delete the session — only if it belongs to this user and is still active
    const { error: sessionError } = await supabase
      .from('quiz_sessions' as 'users')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', input.sessionId)
      .eq('student_id', user.id)
      .is('ended_at', null)

    if (sessionError) {
      console.error('[discardQuiz] Session soft-delete error:', sessionError.message)
      return { success: false, error: 'Failed to discard quiz' }
    }

    // Clean up the associated draft if one exists
    if (input.draftId) {
      const { error: draftError } = await supabase
        .from('quiz_drafts' as 'users')
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
