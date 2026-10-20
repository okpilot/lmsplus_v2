'use server'

import { refresh } from 'next/cache'
import type { ProgressResult } from './quiz-progress-helpers'
import { resumeSavedQuiz } from './saved-quiz'

/** Resume for the session page: the re-render rides this action's response. */
export async function resumeSavedQuizAndRefresh(raw: unknown): Promise<ProgressResult> {
  const result = await resumeSavedQuiz(raw)
  if (result.success) refresh()
  return result
}
