'use server'

import { updateFsrsCard } from '@/lib/fsrs/update-card'
import { rpc } from '@/lib/supabase-rpc'
import { SubmitAnswerSchema } from '@repo/db/schema'
import { createServerSupabaseClient } from '@repo/db/server'
import type { SubmitQuizAnswerResult, SubmitRpcResult } from '../types'

export async function submitQuizAnswer(raw: unknown): Promise<SubmitQuizAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }
  const input = SubmitAnswerSchema.parse(raw)

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
  // FSRS scheduling is best-effort — don't fail the answer if it errors
  try {
    await updateFsrsCard(supabase, user.id, input.questionId, result.is_correct)
  } catch (e) {
    console.error('FSRS card update failed (non-fatal):', e)
  }

  return {
    success: true,
    isCorrect: result.is_correct,
    correctOptionId: result.correct_option_id,
    explanationText: result.explanation_text,
    explanationImageUrl: result.explanation_image_url,
  }
}
