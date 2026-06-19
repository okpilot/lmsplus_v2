// Helpers for discardQuiz. Extracted so discard.ts stays under the 100-line
// Server Action cap from .claude/rules/code-style.md §1.

import type { createServerSupabaseClient } from '@repo/db/server'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

// Modes whose in-progress sessions must never be discarded by the student.
// The server is the real defense even if a UI bug exposes a discard button.
const NON_DISCARDABLE_MODES: Record<string, string> = {
  internal_exam: 'cannot_discard_internal_exam',
  vfr_rt_exam: 'cannot_discard_vfr_rt_exam',
}

/** Returns the error token to reject with, or null if the mode is discardable. */
export function discardBlockedError(mode: string): string | null {
  return NON_DISCARDABLE_MODES[mode] ?? null
}

/**
 * Hard-delete the associated draft if one exists (quiz_drafts has no deleted_at
 * column). Non-fatal: the session is already discarded, so a draft cleanup
 * error is logged but never propagated.
 */
export async function cleanupDiscardedDraft(
  supabase: ServerSupabaseClient,
  draftId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('quiz_drafts')
    .delete()
    .eq('id', draftId)
    .eq('student_id', userId)

  if (error) {
    console.error('[discardQuiz] Draft cleanup error:', error.message)
  }
}
