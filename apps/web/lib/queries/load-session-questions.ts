'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

type QuizQuestionRow = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  explanation_text: string | null
  explanation_image_url: string | null
  options: unknown
}

type Question = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  explanation_text: string | null
  explanation_image_url: string | null
  options: { id: string; text: string }[]
}

type LoadResult = { success: true; questions: Question[] } | { success: false; error: string }

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
    return { success: false, error: error.message }
  }

  if (!data?.length) {
    return { success: false, error: 'No questions found' }
  }

  const questions: Question[] = data.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    question_image_url: q.question_image_url,
    question_number: q.question_number,
    explanation_text: q.explanation_text,
    explanation_image_url: q.explanation_image_url,
    options: (q.options as { id: string; text: string }[]) ?? [],
  }))

  // Preserve the order from questionIds
  const orderMap = new Map(questionIds.map((id, i) => [id, i]))
  questions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))

  return { success: true, questions }
}
