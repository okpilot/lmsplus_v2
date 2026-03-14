'use server'

import { type QuestionStats, getQuestionStats } from '@/lib/queries/question-stats'
import { createServerSupabaseClient } from '@repo/db/server'
import { ZodError, z } from 'zod'

const FetchStatsSchema = z.object({ questionId: z.string().uuid() })

export async function fetchQuestionStats(questionId: string): Promise<QuestionStats> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error('Auth error. Please refresh.')
  if (!user) throw new Error('Not authenticated')

  try {
    const { questionId: id } = FetchStatsSchema.parse({ questionId })
    return await getQuestionStats(id)
  } catch (err) {
    if (!(err instanceof ZodError)) {
      console.error('[fetchQuestionStats] Error:', err)
    }
    throw err
  }
}
