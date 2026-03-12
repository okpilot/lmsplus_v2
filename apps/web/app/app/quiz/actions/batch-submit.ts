'use server'

import { updateFsrsCard } from '@/lib/fsrs/update-card'
import { rpc } from '@/lib/supabase-rpc'
import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { BatchRpcResult, BatchSubmitResult } from '../types'

const BatchSubmitInput = z.object({
  sessionId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedOptionId: z.string(),
        responseTimeMs: z.number().int().positive(),
      }),
    )
    .min(1),
})

export async function batchSubmitQuiz(raw: unknown): Promise<BatchSubmitResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    const input = BatchSubmitInput.parse(raw)

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
      console.error('[batchSubmitQuiz] RPC error:', error?.message)
      return { success: false, error: 'Failed to submit quiz. Please try again.' }
    }

    const results = data.results.map((r) => ({
      questionId: r.question_id,
      isCorrect: r.is_correct,
      correctOptionId: r.correct_option_id,
      explanationText: r.explanation_text,
      explanationImageUrl: r.explanation_image_url,
    }))

    await updateFsrsCards(supabase, user.id, input.answers, results)

    return {
      success: true,
      totalQuestions: data.total_questions,
      correctCount: data.correct_count,
      scorePercentage: data.score_percentage,
      results,
    }
  } catch (err) {
    console.error('[batchSubmitQuiz] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>
type AnswerInput = { questionId: string; selectedOptionId: string; responseTimeMs: number }
type AnswerResult = { isCorrect: boolean }

async function updateFsrsCards(
  supabase: SupabaseClient,
  userId: string,
  answers: AnswerInput[],
  results: AnswerResult[],
) {
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i]
    const answerResult = results[i]
    if (!answer || !answerResult) continue
    try {
      await updateFsrsCard(supabase, userId, answer.questionId, answerResult.isCorrect)
    } catch (e) {
      console.error('FSRS card update failed (non-fatal):', e)
    }
  }
}
