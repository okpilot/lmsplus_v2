'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import type { CheckNonMcAnswerResult } from '../types'
import {
  CheckNonMcAnswerSchema,
  type DialogFillRpcResult,
  isDialogFillRpcResult,
  isShortAnswerRpcResult,
  type ShortAnswerRpcResult,
  toClientBlanks,
  toRpcBlankAnswers,
  verifySessionMembership,
} from './check-non-mc-answer-helpers'

export async function checkNonMcAnswer(raw: unknown): Promise<CheckNonMcAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  let parsed: z.infer<typeof CheckNonMcAnswerSchema>
  try {
    parsed = CheckNonMcAnswerSchema.parse(raw)
  } catch {
    return { success: false, error: 'Invalid input' }
  }
  const { questionId, sessionId } = parsed

  const membershipError = await verifySessionMembership(supabase, {
    sessionId,
    userId: user.id,
    questionId,
  })
  if (membershipError) return { success: false, error: membershipError }

  if ('responseText' in parsed) {
    const { data, error } = await rpc<ShortAnswerRpcResult>(supabase, 'check_non_mc_answer', {
      p_question_id: questionId,
      p_session_id: sessionId,
      p_response_text: parsed.responseText,
    })
    if (error || !isShortAnswerRpcResult(data)) {
      console.error('[checkNonMcAnswer] short_answer RPC error:', error?.message)
      return { success: false, error: 'Could not check answer' }
    }
    return {
      success: true,
      questionType: 'short_answer',
      isCorrect: data.is_correct,
      correctAnswer: data.correct_answer,
      explanationText: data.explanation_text,
      explanationImageUrl: data.explanation_image_url,
    }
  }

  const { data, error } = await rpc<DialogFillRpcResult>(supabase, 'check_non_mc_answer', {
    p_question_id: questionId,
    p_session_id: sessionId,
    p_blank_answers: toRpcBlankAnswers(parsed.blankAnswers),
  })
  if (error || !isDialogFillRpcResult(data)) {
    console.error('[checkNonMcAnswer] dialog_fill RPC error:', error?.message)
    return { success: false, error: 'Could not check answer' }
  }
  return {
    success: true,
    questionType: 'dialog_fill',
    isCorrect: data.is_correct,
    blanks: toClientBlanks(data.blanks),
    explanationText: data.explanation_text,
    explanationImageUrl: data.explanation_image_url,
  }
}
