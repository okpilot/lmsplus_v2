'use server'

import { updateFsrsCard } from '@/lib/fsrs/update-card'
import { getRandomQuestionIds } from '@/lib/queries/quiz'
import { rpc } from '@/lib/supabase-rpc'
import { CompleteQuizSessionSchema, SubmitAnswerSchema } from '@repo/db/schema'
import { createServerSupabaseClient } from '@repo/db/server'
import { ZodError, z } from 'zod'
import type {
  CompleteQuizResult,
  CompleteRpcResult,
  StartQuizResult,
  SubmitQuizAnswerResult,
  SubmitRpcResult,
} from './types'

const StartQuizInput = z.object({
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  count: z.number().int().min(1).max(50).default(10),
})

export async function startQuizSession(raw: unknown): Promise<StartQuizResult> {
  try {
    const input = StartQuizInput.parse(raw)
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const questionIds = await getRandomQuestionIds({
      subjectId: input.subjectId,
      topicId: input.topicId,
      count: input.count,
    })

    if (questionIds.length === 0) {
      return { success: false, error: 'No questions available for this selection' }
    }

    const { data: sessionId, error } = await rpc<string>(supabase, 'start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: input.subjectId,
      p_topic_id: input.topicId,
      p_question_ids: questionIds,
    })

    if (error || !sessionId) {
      console.error('[startQuizSession] RPC error:', error?.message)
      return { success: false, error: 'Failed to start session' }
    }

    return { success: true, sessionId, questionIds }
  } catch (err) {
    if (err instanceof ZodError) {
      return { success: false, error: err.errors[0]?.message ?? 'Invalid input' }
    }
    console.error('[startQuizSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

export async function submitQuizAnswer(raw: unknown): Promise<SubmitQuizAnswerResult> {
  const input = SubmitAnswerSchema.parse(raw)
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

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

export async function completeQuiz(raw: unknown): Promise<CompleteQuizResult> {
  const input = CompleteQuizSessionSchema.parse(raw)
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

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
