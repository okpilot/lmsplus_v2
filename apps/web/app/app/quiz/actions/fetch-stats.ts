'use server'

import { type QuestionStats, getQuestionStats } from '@/lib/queries/question-stats'
import { z } from 'zod'

const FetchStatsSchema = z.object({ questionId: z.string().uuid() })

export async function fetchQuestionStats(questionId: string): Promise<QuestionStats> {
  const { questionId: id } = FetchStatsSchema.parse({ questionId })
  return getQuestionStats(id)
}
