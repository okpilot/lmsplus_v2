'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import { SIGN_IN } from './progress-error-messages'
import { type ProgressResult, toProgressResult } from './quiz-progress-helpers'

const SaveInput = z.object({ sessionId: z.uuid(), deviceId: z.uuid() }).strict()
const DiscardInput = z.object({ sessionId: z.uuid() }).strict()

const INVALID: ProgressResult = { success: false, error: 'Invalid input' }
const UNAUTHENTICATED: ProgressResult = { success: false, error: SIGN_IN }

async function authedClient() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return error || !user ? null : supabase
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
