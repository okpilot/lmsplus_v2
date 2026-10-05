import type { createServerSupabaseClient } from '@repo/db/server'
import { PRACTICE_MODES } from '@/lib/constants/exam-modes'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

// Single source of truth for the saved-draft cap. Enforced at TWO points that
// must stay in sync: (1) the enforce_draft_limit DB trigger (mig 20260430000011,
// advisory-locked — hardcodes 20), and (2) the loadDrafts read bound (load-draft.ts:
// `.limit(MAX_DRAFTS)`). If this value changes, update the trigger migration's hardcoded 20 as well.
export const MAX_DRAFTS = 20

/**
 * Park a saved draft's underlying practice session: soft-delete the `quiz_sessions`
 * row so it stops tripping the single-active-session guard (#1011) and the
 * "unfinished session" banner (#1085). Best-effort — the draft is already saved, so
 * a failure here only leaves the pre-fix state (a lingering active session), never
 * loses the draft. Positive practice-mode allowlist: this must NEVER soft-delete a
 * graded exam (`internal_exam` / `vfr_rt_exam` / `mock_exam`) — a student could
 * otherwise abandon a graded exam via a crafted saveDraft call (the discard path
 * blocks this via NON_DISCARDABLE_MODES; we use a stricter positive allowlist).
 */
export async function closePracticeSessionForDraft(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<void> {
  // Fully best-effort: the draft is already saved, so this must NEVER surface as a
  // save failure — swallow both query errors AND thrown exceptions (network etc.),
  // logging for observability. Rethrowing would make the caller's outer catch report
  // failure for a draft that was actually persisted.
  try {
    const { data, error } = await supabase
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('student_id', userId)
      .is('ended_at', null)
      // Skip already-parked sessions: makes this a true no-op on the resume auto-heal path
      // for a post-fix draft (whose session is already soft-deleted) instead of refreshing
      // deleted_at and logging a spurious "soft-deleted" line.
      .is('deleted_at', null)
      .in('mode', PRACTICE_MODES as readonly string[])
      .select('id')
    if (error) {
      console.error('[closePracticeSession] Session close error:', error.message)
      return
    }
    if ((data?.length ?? 0) > 0) {
      console.log('[closePracticeSession] Session', sessionId, 'soft-deleted for user', userId)
    }
  } catch (err) {
    console.error('[closePracticeSession] Uncaught error:', err)
  }
}
