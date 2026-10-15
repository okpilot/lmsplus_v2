'use server'

import { z } from 'zod'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { getQuestionStats, type QuestionStats } from '@/lib/queries/question-stats'

const FetchStatsSchema = z.object({ questionId: z.uuid() })

export async function fetchQuestionStats(questionId: string): Promise<QuestionStats> {
  const user = await getSessionUser()
  if (!user) throw new Error('Not authenticated')

  let id: string
  try {
    ;({ questionId: id } = FetchStatsSchema.parse({ questionId }))
  } catch {
    console.error('[fetchQuestionStats] Invalid input')
    throw new Error('Invalid input')
  }

  try {
    return await getQuestionStats(id)
  } catch (err) {
    console.error('[fetchQuestionStats] Error:', err)
    throw err
  }
}
