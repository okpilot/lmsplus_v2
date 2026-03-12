'use server'

import { type QuestionStats, getQuestionStats } from '@/lib/queries/question-stats'

export async function fetchQuestionStats(questionId: string): Promise<QuestionStats> {
  return getQuestionStats(questionId)
}
