'use server'

import { SubmitAnswerSchema } from '@repo/db/schema'
import { createServerSupabaseClient } from '@repo/db/server'
import type { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import type { SubmitQuizAnswerResult, SubmitRpcResult } from '../types'

export async function submitQuizAnswer(raw: unknown): Promise<SubmitQuizAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  let input: z.infer<typeof SubmitAnswerSchema>
  try {
    input = SubmitAnswerSchema.parse(raw)
  } catch {
    return { success: false, error: 'Invalid input' }
  }

  const { data, error } = await rpc<SubmitRpcResult>(supabase, 'submit_quiz_answer', {
    p_session_id: input.sessionId,
    p_question_id: input.questionId,
    p_selected_option: input.selectedOptionId,
    p_response_time_ms: input.responseTimeMs,
  })

  if (error || !data?.[0]) {
    console.error('[submitQuizAnswer] RPC error:', error?.message)
    return { success: false, error: 'Failed to submit answer' }
  }

  const result = data[0]

  return {
    success: true,
    isCorrect: result.is_correct,
    correctOptionId: result.correct_option_id,
    explanationText: result.explanation_text,
    explanationImageUrl: result.explanation_image_url,
  }
}
