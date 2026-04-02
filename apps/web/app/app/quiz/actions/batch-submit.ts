'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import type { BatchRpcResult, BatchSubmitResult } from '../types'

const BatchSubmitInput = z.object({
  sessionId: z.uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.uuid(),
        selectedOptionId: z.string(),
        responseTimeMs: z.number().int().positive(),
      }),
    )
    .min(1),
})

export async function batchSubmitQuiz(raw: unknown): Promise<BatchSubmitResult> {
  let input: z.infer<typeof BatchSubmitInput>
  try {
    input = BatchSubmitInput.parse(raw)
  } catch {
    return { success: false, error: 'Invalid input' }
  }

  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const p_answers = input.answers.map((a) => ({
      question_id: a.questionId,
      selected_option: a.selectedOptionId,
      response_time_ms: a.responseTimeMs,
    }))

    const { data, error } = await rpc<BatchRpcResult>(supabase, 'batch_submit_quiz', {
      p_session_id: input.sessionId,
      p_answers: p_answers,
    })

    if (error || !data) {
      const rpcMessage = error?.message ?? 'unknown RPC error'
      console.error('[batchSubmitQuiz] RPC error:', rpcMessage)
      const userMessage = rpcMessage.includes('session not found or not accessible')
        ? 'This session could not be found.'
        : 'Failed to submit quiz. Please try again.'
      return { success: false, error: userMessage }
    }

    const results = data.results.map((r) => ({
      questionId: r.question_id,
      isCorrect: r.is_correct,
      correctOptionId: r.correct_option_id,
      explanationText: r.explanation_text,
      explanationImageUrl: r.explanation_image_url,
    }))

    return {
      success: true,
      totalQuestions: data.total_questions,
      answeredCount: data.answered_count,
      correctCount: data.correct_count,
      scorePercentage: data.score_percentage,
      results,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[batchSubmitQuiz] Uncaught error:', message)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
