'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'
import { type LoadResult, type QuizQuestionRow, toQuestion } from './load-session-question-row'

export async function loadSessionQuestions(questionIds: string[]): Promise<LoadResult> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[loadSessionQuestions] Auth error:', authError.message)
    return { success: false, error: 'Not authenticated' }
  }
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await rpc<QuizQuestionRow[]>(supabase, 'get_quiz_questions', {
    p_question_ids: questionIds,
  })

  if (error) {
    console.error('[loadSessionQuestions] RPC error:', error.message)
    return { success: false, error: 'Failed to load questions. Please try again.' }
  }

  if (!data?.length) {
    return { success: false, error: 'No questions found' }
  }

  const questions = data.map(toQuestion)

  // Preserve the order from questionIds
  const orderMap = new Map(questionIds.map((id, i) => [id, i]))
  questions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))

  return { success: true, questions }
}
