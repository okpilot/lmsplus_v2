'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'

// endDiscovery takes no meaningful input; accept (and ignore) an optional empty
// object so the client call signature stays stable if a payload is added later.
const EndDiscoveryInput = z.object({}).optional()

/**
 * Soft-deletes the caller's active discovery (Study Mode) session row(s), keyed by
 * student + mode — owner-scoped via the user client (RLS WITH CHECK already permits
 * a student to set deleted_at on their own quiz_sessions; see discardQuiz). Called
 * on Discovery Exit and as best-effort teardown if startStudy fails after creating
 * the row, so a single active session can never strand and block other modes.
 *
 * Zero rows affected is a VALID no-op here (the row was abandoned, already cleared,
 * or never created) — unlike discardQuiz, it is not treated as an error.
 */
export async function endDiscovery(raw?: unknown): Promise<ActionResult> {
  try {
    EndDiscoveryInput.parse(raw)
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

    const { data, error } = await supabase
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', user.id)
      .eq('mode', 'discovery')
      .is('ended_at', null)
      .is('deleted_at', null)
      .select('id')

    if (error) {
      console.error('[endDiscovery] Soft-delete error:', error.message, error.code)
      return { success: false, error: 'Failed to exit discovery' }
    }
    if ((data?.length ?? 0) > 0) {
      console.log('[endDiscovery] Exited', data?.length, 'discovery session(s) for user', user.id)
    }
    return { success: true }
  } catch (err) {
    console.error('[endDiscovery] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
