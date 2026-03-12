'use server'

import { updateFsrsCard } from '@/lib/fsrs/update-card'
import { getDueCards } from '@/lib/queries/review'
import { rpc } from '@/lib/supabase-rpc'
import { CompleteQuizSessionSchema, SubmitAnswerSchema } from '@repo/db/schema'
import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type {
  CompleteReviewResult,
  CompleteRpcResult,
  StartReviewResult,
  SubmitAnswerResult,
  SubmitRpcResult,
} from './types'

const StartReviewSchema = z.object({ subjectIds: z.array(z.string().uuid()).optional() })

export async function startReviewSession(raw?: unknown): Promise<StartReviewResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    const input = StartReviewSchema.parse(raw ?? {})

    const dueCards = await getDueCards({ limit: 20, subjectIds: input.subjectIds })
    const questionIds = dueCards.map((c) => c.questionId)
    if (questionIds.length === 0)
      return { success: false, error: 'No questions available for review' }

    const { data: sessionId, error } = await rpc<string>(supabase, 'start_quiz_session', {
      p_mode: 'smart_review',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: questionIds,
    })

    if (error || !sessionId) {
      console.error('[startReviewSession] RPC error:', error?.message)
      return { success: false, error: 'Failed to start session' }
    }
    return { success: true, sessionId, questionIds }
  } catch (err) {
    console.error('[startReviewSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

export async function submitReviewAnswer(raw: unknown): Promise<SubmitAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  const input = SubmitAnswerSchema.parse(raw)

  const { data, error } = await rpc<SubmitRpcResult>(supabase, 'submit_quiz_answer', {
    p_session_id: input.sessionId,
    p_question_id: input.questionId,
    p_selected_option: input.selectedOptionId,
    p_response_time_ms: input.responseTimeMs,
  })

  if (error || !data?.[0]) {
    console.error('[submitReviewAnswer] RPC error:', error?.message)
    return { success: false, error: 'Failed to submit answer' }
  }

  const result = data[0]
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

export async function completeReviewSession(raw: unknown): Promise<CompleteReviewResult> {
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
    console.error('[completeReviewSession] RPC error:', error?.message)
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
