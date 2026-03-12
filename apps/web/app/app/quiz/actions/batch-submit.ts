'use server'

import { updateFsrsCard } from '@/lib/fsrs/update-card'
import { rpc } from '@/lib/supabase-rpc'
import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type {
  BatchAnswerResult,
  BatchSubmitResult,
  CompleteRpcResult,
  SubmitRpcResult,
} from '../types'

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

    const results = await submitAllAnswers(supabase, input.sessionId, input.answers)
    const completion = await completeSession(supabase, input.sessionId)
    if (!completion) return { success: false, error: 'Failed to complete session' }

    await updateFsrsCards(supabase, user.id, input.answers, results)

    return {
      success: true,
      totalQuestions: completion.total_questions,
      correctCount: completion.correct_count,
      scorePercentage: completion.score_percentage,
      results,
    }
  } catch {
    console.error('[batchSubmitQuiz] Uncaught error')
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>
type AnswerInput = { questionId: string; selectedOptionId: string; responseTimeMs: number }

async function submitAllAnswers(
  supabase: SupabaseClient,
  sessionId: string,
  answers: AnswerInput[],
): Promise<BatchAnswerResult[]> {
  const results: BatchAnswerResult[] = []
  for (const answer of answers) {
    const { data, error } = await rpc<SubmitRpcResult>(supabase, 'submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: answer.questionId,
      p_selected_option: answer.selectedOptionId,
      p_response_time_ms: answer.responseTimeMs,
    })
    if (error || !data?.[0]) {
      throw new Error(`Failed to submit answer for question ${answer.questionId}`)
    }
    const row = data[0]
    results.push({
      questionId: answer.questionId,
      isCorrect: row.is_correct,
      correctOptionId: row.correct_option_id,
      explanationText: row.explanation_text,
      explanationImageUrl: row.explanation_image_url,
    })
  }
  return results
}

async function completeSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<CompleteRpcResult[number] | null> {
  const { data, error } = await rpc<CompleteRpcResult>(supabase, 'complete_quiz_session', {
    p_session_id: sessionId,
  })
  if (error || !data?.[0]) {
    console.error('[batchSubmitQuiz] complete RPC error:', error?.message)
    return null
  }
  return data[0]
}

async function updateFsrsCards(
  supabase: SupabaseClient,
  userId: string,
  answers: AnswerInput[],
  results: BatchAnswerResult[],
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
