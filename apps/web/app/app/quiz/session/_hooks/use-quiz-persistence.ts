import { useCallback } from 'react'
import type { DraftAnswer, QuizStateOpts } from '../../types'
import { buildActiveSession, writeActiveSession } from '../_utils/quiz-session-storage'

export function useQuizPersistence(opts: QuizStateOpts) {
  const checkpoint = useCallback(
    (a: Map<string, DraftAnswer>, idx: number) =>
      writeActiveSession(buildActiveSession(opts, a, idx)),
    [opts],
  )
  return { checkpoint }
}
