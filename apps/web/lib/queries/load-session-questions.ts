'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { verifySessionUser } from '@/lib/auth/verify-session-user'
import { type LoadResult, toQuestions } from './load-session-question-row'

const QuestionIdsSchema = z.array(z.uuid()).min(1).max(500)

export async function loadSessionQuestions(input: unknown): Promise<LoadResult> {
  const parsed = QuestionIdsSchema.safeParse(input)
  if (!parsed.success) {
    console.error('[loadSessionQuestions] Invalid input:', parsed.error.message)
    return { success: false, error: 'Invalid questions' }
  }
  const questionIds = parsed.data

  const supabase = await createServerSupabaseClient()

  const user = await verifySessionUser(supabase)
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase.rpc('get_quiz_questions', {
    p_question_ids: questionIds,
  })

  if (error) {
    console.error('[loadSessionQuestions] RPC error:', error.message)
    return { success: false, error: 'Failed to load questions. Please try again.' }
  }

  if (!data?.length) {
    return { success: false, error: 'No questions found' }
  }

  const questions = toQuestions(data, 'loadSessionQuestions')
  if (!questions) return { success: false, error: 'Failed to load questions. Please try again.' }

  // Preserve the order from questionIds
  const orderMap = new Map(questionIds.map((id, i) => [id, i]))
  questions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))

  return { success: true, questions }
}
