'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'

// Optional payload. When sessionId is provided, the teardown is scoped to that one
// row (the orphan-cleanup path in startStudy) so a slow failing request can never
// tombstone a newer discovery row from a concurrent retry. Absent (the Exit-button
// case), the teardown clears every active discovery row for the caller.
const EndDiscoveryInput = z.object({ sessionId: z.uuid().optional() }).optional()

/**
 * Soft-deletes the caller's active discovery (Study Mode) session row(s), keyed by
 * student + mode — owner-scoped via the user client (RLS WITH CHECK already permits
 * a student to set deleted_at on their own quiz_sessions; see discardQuiz). Called
 * on Discovery Exit (blanket teardown) and as best-effort teardown if startStudy
 * fails after creating the row (scoped to that one sessionId), so a single active
 * session can never strand and block other modes.
 *
 * Zero rows affected is a VALID no-op here (the row was abandoned, already cleared,
 * or never created) — unlike discardQuiz, it is not treated as an error.
 */
export async function endDiscovery(raw?: unknown): Promise<ActionResult> {
  let input: { sessionId?: string } | undefined
  try {
    input = EndDiscoveryInput.parse(raw)
  } catch {
    return { success: false, error: 'Invalid input' }
  }

  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    let query = supabase
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', user.id)
      .eq('mode', 'discovery')
      .is('ended_at', null)
      .is('deleted_at', null)
    // Scope to the single created row when the caller passed an id (orphan cleanup);
    // otherwise clear every active discovery row (Exit button).
    if (input?.sessionId) query = query.eq('id', input.sessionId)

    const { data, error } = await query.select('id')

    if (error) {
      console.error('[endDiscovery] Soft-delete error:', error.message, error.code)
      return { success: false, error: 'Failed to exit discovery' }
    }
    const affected = data?.length ?? 0
    if (affected > 0) {
      console.log('[endDiscovery] Exited', affected, 'discovery session(s)')
    }
    return { success: true }
  } catch (err) {
    console.error('[endDiscovery] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
