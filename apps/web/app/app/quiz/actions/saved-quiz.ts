'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { MAX_SAVED_QUIZZES } from '@/lib/queries/load-saved-quizzes'
import { rpc } from '@/lib/supabase-rpc'
import { SAVED_QUIZ_LIMIT, SIGN_IN } from './progress-error-messages'
import { type ProgressResult, toProgressResult } from './quiz-progress-helpers'

const SaveInput = z.object({ sessionId: z.uuid(), deviceId: z.uuid() }).strict()
const DiscardInput = z.object({ sessionId: z.uuid() }).strict()

const INVALID: ProgressResult = { success: false, error: 'Invalid input' }
const UNAUTHENTICATED: ProgressResult = { success: false, error: SIGN_IN }

async function authedUser() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return error || !user ? null : { supabase, uid: user.id }
}

async function authedClient() {
  return (await authedUser())?.supabase ?? null
}

/**
 * Pre-flight for the blocked-start flow: refuses when the student already holds the saved-quiz
 * cap, so nothing is claimed first. save_quiz_for_later still enforces the cap; this only avoids
 * a takeover that the refused save would leave behind. Saved rows are soft-deleted by design,
 * so there is no deleted_at filter.
 */
export async function checkSavedQuizRoom(): Promise<ProgressResult> {
  const auth = await authedUser()
  if (!auth) return UNAUTHENTICATED
  const { count, error } = await auth.supabase
    .from('quiz_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', auth.uid)
    .not('saved_at', 'is', null)
  if (error) {
    console.error('[checkSavedQuizRoom] Count error:', error.message)
    return { success: false, error: 'Could not check your saved quizzes' }
  }
  if ((count ?? 0) >= MAX_SAVED_QUIZZES) {
    return { success: false, error: SAVED_QUIZ_LIMIT }
  }
  return { success: true }
}

/** Parks the open practice quiz as saved on the same session id. A retried save succeeds. */
export async function saveQuizForLater(raw: unknown): Promise<ProgressResult> {
  const parsed = SaveInput.safeParse(raw)
  if (!parsed.success) return INVALID
  const supabase = await authedClient()
  if (!supabase) return UNAUTHENTICATED
  const { error } = await rpc<null>(supabase, 'save_quiz_for_later', {
    p_session_id: parsed.data.sessionId,
    p_device_id: parsed.data.deviceId,
  })
  return toProgressResult(error, 'saveQuizForLater')
}

/** Restores a saved quiz on its own session id and claims it for the calling device. */
export async function resumeSavedQuiz(raw: unknown): Promise<ProgressResult> {
  const parsed = SaveInput.safeParse(raw)
  if (!parsed.success) return INVALID
  const supabase = await authedClient()
  if (!supabase) return UNAUTHENTICATED
  const { error } = await rpc<null>(supabase, 'resume_saved_quiz', {
    p_session_id: parsed.data.sessionId,
    p_device_id: parsed.data.deviceId,
  })
  return toProgressResult(error, 'resumeSavedQuiz')
}

/** Clears the saved marker; the row stays soft-deleted. */
export async function discardSavedQuiz(raw: unknown): Promise<ProgressResult> {
  const parsed = DiscardInput.safeParse(raw)
  if (!parsed.success) return INVALID
  const supabase = await authedClient()
  if (!supabase) return UNAUTHENTICATED
  const { error } = await rpc<null>(supabase, 'discard_saved_quiz', {
    p_session_id: parsed.data.sessionId,
  })
  return toProgressResult(error, 'discardSavedQuiz')
}
