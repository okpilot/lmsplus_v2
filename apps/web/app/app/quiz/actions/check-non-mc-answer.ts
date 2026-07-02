'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import type { CheckNonMcAnswerResult } from '../types'
import { checkDiagramLabelAnswer, checkDialogFillAnswer } from './check-non-mc-answer-dispatch'
import {
  isOrderingRpcResult,
  isShortAnswerRpcResult,
  type OrderingRpcResult,
  type ShortAnswerRpcResult,
  verifySessionMembership,
} from './check-non-mc-answer-helpers'
import { CheckNonMcAnswerSchema } from './check-non-mc-answer-schema'

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

  if ('order' in parsed) {
    const { data, error } = await rpc<OrderingRpcResult>(supabase, 'check_non_mc_answer', {
      p_question_id: questionId,
      p_session_id: sessionId,
      p_order: parsed.order,
    })
    if (error || !isOrderingRpcResult(data)) {
      console.error('[checkNonMcAnswer] ordering RPC error:', error?.message)
      return { success: false, error: 'Could not check answer' }
    }
    return {
      success: true,
      questionType: 'ordering',
      isCorrect: data.is_correct,
      correctOrder: data.correct_order,
      explanationText: data.explanation_text,
      explanationImageUrl: data.explanation_image_url,
    }
  }

  if ('mapping' in parsed) {
    return checkDiagramLabelAnswer(supabase, questionId, sessionId, parsed.mapping)
  }

  return checkDialogFillAnswer(supabase, questionId, sessionId, parsed.blankAnswers)
}
