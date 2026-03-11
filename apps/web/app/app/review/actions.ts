'use server'

import { getDueCards, getNewQuestionIds } from '@/lib/queries/review'
import { rpc, upsert } from '@/lib/supabase-rpc'
import {
  createEmptyCard,
  dbRowToCard,
  ratingFromAnswer,
  scheduleCard,
  stateToString,
} from '@repo/db/fsrs'
import { CompleteQuizSessionSchema, SubmitAnswerSchema } from '@repo/db/schema'
import { createServerSupabaseClient } from '@repo/db/server'

type SubmitRpcResult = {
  is_correct: boolean
  correct_option_id: string
  explanation_text: string
  explanation_image_url: string
}[]

type CompleteRpcResult = {
  total_questions: number
  correct_count: number
  score_percentage: number
}[]

type FsrsCardRow = {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: string
  last_review: string | null
}

export type StartReviewResult =
  | { success: true; sessionId: string; questionIds: string[] }
  | { success: false; error: string }

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

export type SubmitAnswerResult =
  | {
      success: true
      isCorrect: boolean
      correctOptionId: string
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | { success: false; error: string }

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

export type CompleteReviewResult =
  | { success: true; totalQuestions: number; correctCount: number; scorePercentage: number }
  | { success: false; error: string }

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

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

async function updateFsrsCard(
  supabase: SupabaseClient,
  userId: string,
  questionId: string,
  isCorrect: boolean,
) {
  const { data: existing, error: cardError } = await supabase
    .from('fsrs_cards')
    .select(
      'due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review',
    )
    .eq('student_id' as string & keyof never, userId)
    .eq('question_id' as string & keyof never, questionId)
    .returns<FsrsCardRow[]>()
    .maybeSingle()

  if (cardError) {
    console.error('FSRS card lookup failed:', cardError.message)
    return
  }

  const card = existing ? dbRowToCard(existing) : createEmptyCard()
  const grade = ratingFromAnswer(isCorrect)
  const scheduled = scheduleCard(card, grade)
  const next = scheduled.card

  await upsert(
    supabase,
    'fsrs_cards',
    {
      student_id: userId,
      question_id: questionId,
      due: next.due.toISOString(),
      stability: next.stability,
      difficulty: next.difficulty,
      elapsed_days: next.elapsed_days,
      scheduled_days: next.scheduled_days,
      reps: next.reps,
      lapses: next.lapses,
      state: stateToString(next.state),
      last_review: new Date().toISOString(),
    },
    { onConflict: 'student_id,question_id' },
  )
}
