// Helpers for toggleFlag. Extracted from flag.ts.

import type { createServerSupabaseClient } from '@repo/db/server'
import { resolveZeroRowWrite } from './_caller-active'
import { NOT_ACTIVE } from './progress-error-messages'

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
 * Looks up whether the question is currently flagged for the student.
 * Logs the DB error with the [toggleFlag] prefix and returns { error: true }.
 */
export async function lookupActiveFlag(
  supabase: ServerSupabaseClient,
  userId: string,
  questionId: string,
): Promise<{ flagged: boolean } | { error: true }> {
  const { data: existing, error: lookupError } = await supabase
    .from('active_flagged_questions')
    .select('student_id')
    .eq('student_id', userId)
    .eq('question_id', questionId)
    .maybeSingle()

  if (lookupError) {
    console.error('[toggleFlag] Lookup error:', lookupError.message)
    return { error: true }
  }
  return { flagged: Boolean(existing) }
}

function unflagZeroRowResult(supabase: ServerSupabaseClient, userId: string) {
  return resolveZeroRowWrite<FlagResult, FlagResult>(supabase, {
    userId,
    tag: 'toggleFlag',
    whenActive: { success: true, flagged: false },
    whenInactive: { success: false, error: NOT_ACTIVE },
    whenError: { success: false, error: 'Failed to unflag' },
  })
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
  // Zero rows: unflagged concurrently, or RLS refused a deactivated caller (mig 20261015000100).
  if (!data?.length) {
    return unflagZeroRowResult(supabase, userId)
  }
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
