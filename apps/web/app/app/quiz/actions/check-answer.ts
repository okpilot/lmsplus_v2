'use server'

import { rpc } from '@/lib/supabase-rpc'
import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { CheckAnswerResult } from '../types'

const CheckAnswerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().min(1),
  sessionId: z.string().uuid(),
})

type CheckAnswerRpcResult = {
  is_correct: boolean
  correct_option_id: string
  explanation_text: string | null
  explanation_image_url: string | null
}

function isCheckAnswerRpcResult(value: unknown): value is CheckAnswerRpcResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.is_correct === 'boolean' &&
    typeof v.correct_option_id === 'string' &&
    (v.explanation_text === null || typeof v.explanation_text === 'string') &&
    (v.explanation_image_url === null || typeof v.explanation_image_url === 'string')
  )
}

export async function checkAnswer(raw: unknown): Promise<CheckAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { questionId, selectedOptionId, sessionId } = CheckAnswerSchema.parse(raw)

  // Verify session belongs to this user, is active, and contains the question
  const { data: session, error: sessionError } = await supabase
    .from('quiz_sessions')
    .select('config')
    .eq('id' as string & keyof never, sessionId)
    .eq('student_id' as string & keyof never, user.id)
    .is('ended_at' as string & keyof never, null)
    .is('deleted_at' as string & keyof never, null)
    .single()
  if (sessionError || !session) return { success: false, error: 'Session not found' }
  const config = (session as unknown as { config: { question_ids: unknown } }).config
  const qIds = config?.question_ids
  if (!Array.isArray(qIds) || !qIds.includes(questionId)) {
    return { success: false, error: 'Question not in session' }
  }

  const { data, error } = await rpc<CheckAnswerRpcResult>(supabase, 'check_quiz_answer', {
    p_question_id: questionId,
    p_selected_option_id: selectedOptionId,
    p_session_id: sessionId,
  })

  if (error || !isCheckAnswerRpcResult(data)) {
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
