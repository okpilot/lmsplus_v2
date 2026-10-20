'use server'

import { refresh } from 'next/cache'
import { resumeSavedQuiz } from './saved-quiz'

/** Resume for the session page: the re-render rides this action's response. */
export async function resumeSavedQuizAndRefresh(raw: unknown) {
  const result = await resumeSavedQuiz(raw)
  if (result.success) refresh()
  return result
}
