'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { getQuestionStats, type QuestionStats } from '@/lib/queries/question-stats'

const FetchStatsSchema = z.object({ questionId: z.uuid() })

export async function fetchQuestionStats(questionId: string): Promise<QuestionStats> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error('Auth error. Please refresh.')
  if (!user) throw new Error('Not authenticated')

  let id: string
  try {
    ;({ questionId: id } = FetchStatsSchema.parse({ questionId }))
  } catch {
    throw new Error('Invalid input')
  }

  try {
    return await getQuestionStats(id)
  } catch (err) {
    console.error('[fetchQuestionStats] Error:', err)
    throw err
  }
}
