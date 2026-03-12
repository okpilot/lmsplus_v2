'use server'

import { rpc } from '@/lib/supabase-rpc'
import { CompleteQuizSessionSchema } from '@repo/db/schema'
import { createServerSupabaseClient } from '@repo/db/server'
import type { CompleteQuizResult, CompleteRpcResult } from '../types'

export async function completeQuiz(raw: unknown): Promise<CompleteQuizResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  const input = CompleteQuizSessionSchema.parse(raw)

  const { data, error } = await rpc<CompleteRpcResult>(supabase, 'complete_quiz_session', {
    p_session_id: input.sessionId,
  })

  if (error || !data?.[0]) {
    console.error('[completeQuiz] RPC error:', error?.message)
    return { success: false, error: 'Failed to complete session' }
  }

  const result = data[0]
  return {
    success: true,
    totalQuestions: result.total_questions,
    correctCount: result.correct_count,
    scorePercentage: result.score_percentage,
  }
}
