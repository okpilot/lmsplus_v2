// Helpers for toggleFlag. Extracted so flag.ts stays under the 100-line
// Server Action cap from .claude/rules/code-style.md §1.

import type { createServerSupabaseClient } from '@repo/db/server'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type FlagResult = { success: true; flagged: boolean } | { success: false; error: string }

/**
 * Checks whether the caller has an active internal_exam session.
 * The #1011 single-active-session invariant means "has an active internal_exam
 * session" fully captures "is in an internal exam" — no sessionId needed.
 * Logs the DB error with the [toggleFlag] prefix and returns dbError:true.
 */
export async function findActiveInternalExamSession(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<{ active: boolean; dbError: boolean }> {
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('id')
    .eq('student_id', userId)
    .eq('mode', 'internal_exam')
    .is('ended_at', null)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[toggleFlag] active-exam guard error:', error.message)
    return { active: false, dbError: true }
  }
  return { active: data !== null, dbError: false }
}

/**
 * Looks up whether the question is currently flagged for the student and
 * toggles it (flag if not present, unflag if present). Extracted from
 * toggleFlag so the Server Action orchestrator stays under the 30-line cap.
 */
export async function lookupAndToggleFlag(
  supabase: ServerSupabaseClient,
  userId: string,
  questionId: string,
): Promise<FlagResult> {
  const { data: existing, error: lookupError } = await supabase
    .from('active_flagged_questions')
    .select('student_id')
    .eq('student_id', userId)
    .eq('question_id', questionId)
    .maybeSingle()

  if (lookupError) {
    console.error('[toggleFlag] Lookup error:', lookupError.message)
    return { success: false, error: 'Failed to toggle flag' }
  }

  return existing
    ? unflagQuestion(supabase, userId, questionId)
    : flagQuestion(supabase, userId, questionId)
}

export async function unflagQuestion(
  supabase: ServerSupabaseClient,
  userId: string,
  questionId: string,
): Promise<FlagResult> {
  // Atomic: only matches active (non-deleted) flags, safe against concurrent toggle
  const { data, error } = await supabase
    .from('flagged_questions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('student_id', userId)
    .eq('question_id', questionId)
    .is('deleted_at', null)
    .select('student_id')
  if (error) {
    console.error('[toggleFlag] Unflag error:', error.message)
    return { success: false, error: 'Failed to unflag' }
  }
  // Zero rows = already unflagged concurrently; still correct terminal state
  if (!data?.length) return { success: true, flagged: false }
  return { success: true, flagged: false }
}

export async function flagQuestion(
  supabase: ServerSupabaseClient,
  userId: string,
  questionId: string,
): Promise<FlagResult> {
  const { error } = await supabase.from('flagged_questions').upsert(
    {
      student_id: userId,
      question_id: questionId,
      flagged_at: new Date().toISOString(),
      deleted_at: null,
    },
    { onConflict: 'student_id,question_id' },
  )
  if (error) {
    console.error('[toggleFlag] Flag error:', error.message)
    return { success: false, error: 'Failed to flag' }
  }
  return { success: true, flagged: true }
}
