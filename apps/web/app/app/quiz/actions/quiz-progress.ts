'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'
import { SIGN_IN } from './progress-error-messages'
import { type ProgressResult, toAnswerJson, toProgressResult } from './quiz-progress-helpers'
import { ClaimInput, SaveAnswerInput, SavePositionInput } from './quiz-progress-schema'

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

export async function saveQuizAnswer(raw: unknown): Promise<ProgressResult> {
  const parsed = SaveAnswerInput.safeParse(raw)
  if (!parsed.success) return INVALID
  const supabase = await authedClient()
  if (!supabase) return UNAUTHENTICATED
  const input = parsed.data
  const { error } = await rpc<null>(supabase, 'save_quiz_answer', {
    p_session_id: input.sessionId,
    p_question_id: input.questionId,
    p_answer: toAnswerJson(input.answer),
    p_time_spent_ms: input.timeSpentMs,
    p_device_id: input.deviceId,
  })
  return toProgressResult(error, 'saveQuizAnswer')
}

export async function saveQuizPosition(raw: unknown): Promise<ProgressResult> {
  const parsed = SavePositionInput.safeParse(raw)
  if (!parsed.success) return INVALID
  const supabase = await authedClient()
  if (!supabase) return UNAUTHENTICATED
  const input = parsed.data
  const { error } = await rpc<null>(supabase, 'save_quiz_position', {
    p_session_id: input.sessionId,
    p_current_index: input.currentIndex,
    p_pinned_question_ids: input.pinnedQuestionIds,
    p_device_id: input.deviceId,
    p_question_id: input.leaving?.questionId ?? null,
    p_time_spent_ms: input.leaving?.timeSpentMs ?? null,
  })
  return toProgressResult(error, 'saveQuizPosition')
}

export async function claimQuizSession(raw: unknown): Promise<ProgressResult> {
  const parsed = ClaimInput.safeParse(raw)
  if (!parsed.success) return INVALID
  const supabase = await authedClient()
  if (!supabase) return UNAUTHENTICATED
  const { error } = await rpc<null>(supabase, 'claim_quiz_session', {
    p_session_id: parsed.data.sessionId,
    p_device_id: parsed.data.deviceId,
  })
  return toProgressResult(error, 'claimQuizSession')
}
