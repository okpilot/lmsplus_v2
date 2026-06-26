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
  question_type: 'multiple_choice' | 'short_answer' | 'dialog_fill' | 'ordering'
  dialog_template: string | null
  blanks_safe: unknown
  ordering_items_shuffled: unknown
}

type Question = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  explanation_text: string | null
  explanation_image_url: string | null
  options: { id: string; text: string }[]
  question_type: 'multiple_choice' | 'short_answer' | 'dialog_fill' | 'ordering'
  dialog_template: string | null
  blanks_safe: { index: number }[] | null
  ordering_items: { id: string; text: string }[] | null
}

type LoadResult = { success: true; questions: Question[] } | { success: false; error: string }

// Element-level guard for the ordering_items_shuffled RPC payload (#998 CR). Array.isArray
// alone would admit a malformed array whose elements lack string id/text and pass it through
// as trusted ordering items; this narrows the cast per code-style §5 (pair a cast with a
// runtime guard). The id/text values are CHECK-enforced server-side (mig 134), so this is
// defense-in-depth, but it keeps the mapper honest against future RPC drift.
function isOrderingItem(value: unknown): value is { id: string; text: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { text?: unknown }).text === 'string'
  )
}

function isOrderingItemArray(value: unknown): value is { id: string; text: string }[] {
  return Array.isArray(value) && value.every(isOrderingItem)
}

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

  const questions: Question[] = data.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    question_image_url: q.question_image_url,
    question_number: q.question_number,
    explanation_text: q.explanation_text,
    explanation_image_url: q.explanation_image_url,
    options: Array.isArray(q.options) ? (q.options as { id: string; text: string }[]) : [],
    question_type: q.question_type,
    dialog_template: q.dialog_template,
    blanks_safe: Array.isArray(q.blanks_safe) ? (q.blanks_safe as { index: number }[]) : null,
    ordering_items: isOrderingItemArray(q.ordering_items_shuffled)
      ? q.ordering_items_shuffled
      : null,
  }))

  // Preserve the order from questionIds
  const orderMap = new Map(questionIds.map((id, i) => [id, i]))
  questions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))

  return { success: true, questions }
}
