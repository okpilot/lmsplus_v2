'use server'

import { rpc } from '@/lib/supabase-rpc'
import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { CheckAnswerResult } from '../types'

const CheckAnswerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().min(1),
})

type CheckAnswerRpcResult = {
  is_correct: boolean
  correct_option_id: string
  explanation_text: string | null
  explanation_image_url: string | null
}

export async function checkAnswer(raw: unknown): Promise<CheckAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { questionId, selectedOptionId } = CheckAnswerSchema.parse(raw)

  const { data, error } = await rpc<CheckAnswerRpcResult>(supabase, 'check_quiz_answer', {
    p_question_id: questionId,
    p_selected_option_id: selectedOptionId,
  })

  if (error || !data) {
    console.error('[checkAnswer] RPC error:', error?.message)
    return { success: false, error: 'Question not found' }
  }

  return {
    success: true,
    isCorrect: data.is_correct,
    correctOptionId: data.correct_option_id,
    explanationText: data.explanation_text,
    explanationImageUrl: data.explanation_image_url,
  }
}
