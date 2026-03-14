'use server'

import { type QuestionStats, getQuestionStats } from '@/lib/queries/question-stats'
import { ZodError, z } from 'zod'

const FetchStatsSchema = z.object({ questionId: z.string().uuid() })

export async function fetchQuestionStats(questionId: string): Promise<QuestionStats> {
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
