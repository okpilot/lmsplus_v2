'use server'

import { type QuestionStats, getQuestionStats } from '@/lib/queries/question-stats'
import { z } from 'zod'

const FetchStatsSchema = z.object({ questionId: z.string().uuid() })

export async function fetchQuestionStats(questionId: string): Promise<QuestionStats> {
  try {
    const { questionId: id } = FetchStatsSchema.parse({ questionId })
    return await getQuestionStats(id)
  } catch (err) {
    console.error('[fetchQuestionStats] Error:', err)
    throw err
  }
}
