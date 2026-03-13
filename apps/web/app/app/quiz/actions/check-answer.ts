'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { CheckAnswerResult } from '../types'

const CheckAnswerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().min(1),
})

type QuestionRow = {
  options: { id: string; correct: boolean }[]
  explanation_text: string | null
  explanation_image_url: string | null
}

export async function checkAnswer(raw: unknown): Promise<CheckAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { questionId, selectedOptionId } = CheckAnswerSchema.parse(raw)

  const { data, error } = await supabase
    .from('questions')
    .select('options, explanation_text, explanation_image_url')
    .eq('id' as string & keyof never, questionId)
    .is('deleted_at' as string & keyof never, null)
    .single<QuestionRow>()

  if (error || !data) {
    console.error('[checkAnswer] Query error:', error?.message)
    return { success: false, error: 'Question not found' }
  }

  const correctOption = data.options.find((o) => o.correct)
  if (!correctOption) {
    return { success: false, error: 'No correct option found' }
  }

  return {
    success: true,
    isCorrect: selectedOptionId === correctOption.id,
    correctOptionId: correctOption.id,
    explanationText: data.explanation_text,
    explanationImageUrl: data.explanation_image_url,
  }
}
