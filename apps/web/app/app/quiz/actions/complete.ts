'use server'

import { CompleteQuizSessionSchema } from '@repo/db/schema'
import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'
import type { CompleteQuizResult, CompleteRpcResult } from '../types'

export async function completeQuiz(raw: unknown): Promise<CompleteQuizResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }
  let input: { sessionId: string }
  try {
    input = CompleteQuizSessionSchema.parse(raw)
  } catch {
    return { success: false, error: 'Invalid input' }
  }

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
