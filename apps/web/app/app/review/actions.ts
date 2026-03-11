'use server'

import { updateFsrsCard } from '@/lib/fsrs/update-card'
import { getDueCards, getNewQuestionIds } from '@/lib/queries/review'
import { rpc } from '@/lib/supabase-rpc'
import { CompleteQuizSessionSchema, SubmitAnswerSchema } from '@repo/db/schema'
import { createServerSupabaseClient } from '@repo/db/server'
import type {
  CompleteReviewResult,
  CompleteRpcResult,
  StartReviewResult,
  SubmitAnswerResult,
  SubmitRpcResult,
} from './types'

export type { CompleteReviewResult, StartReviewResult, SubmitAnswerResult }

export async function startReviewSession(): Promise<StartReviewResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const dueCards = await getDueCards(20)
  let questionIds = dueCards.map((c) => c.questionId)

  if (questionIds.length < 10) {
    const newIds = await getNewQuestionIds(20 - questionIds.length)
    questionIds = [...questionIds, ...newIds]
  }

  if (questionIds.length === 0) {
    return { success: false, error: 'No questions available for review' }
  }

  const { data: sessionId, error } = await rpc<string>(supabase, 'start_quiz_session', {
    p_mode: 'smart_review',
    p_subject_id: null,
    p_topic_id: null,
    p_question_ids: questionIds,
  })

  if (error || !sessionId) {
    return { success: false, error: error?.message ?? 'Failed to start session' }
  }

  return { success: true, sessionId, questionIds }
}

export async function submitReviewAnswer(raw: unknown): Promise<SubmitAnswerResult> {
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
    return { success: false, error: error?.message ?? 'Failed to submit answer' }
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

export async function completeReviewSession(raw: unknown): Promise<CompleteReviewResult> {
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
    return { success: false, error: error?.message ?? 'Failed to complete session' }
  }

  const result = data[0]
  return {
    success: true,
    totalQuestions: result.total_questions,
    correctCount: result.correct_count,
    scorePercentage: result.score_percentage,
  }
}
