import { useCallback } from 'react'
import type { AnswerFeedback, DraftAnswer, QuizStateOpts } from '../../types'
import { buildActiveSession, writeActiveSession } from '../_utils/quiz-session-storage'

export function useQuizPersistence(opts: QuizStateOpts) {
  const checkpoint = useCallback(
    (a: Map<string, DraftAnswer>, idx: number, fb?: Map<string, AnswerFeedback>) =>
      writeActiveSession(buildActiveSession(opts, a, idx, fb)),
    [opts],
  )
  return { checkpoint }
}
