import { useCallback } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { buildActiveSession, writeActiveSession } from '../_utils/quiz-session-storage'
import { isTakenOver } from '../_utils/session-takeover'

export function useQuizPersistence(opts: QuizStateOpts) {
  const checkpoint = useCallback(
    (a: Map<string, DraftAnswer>, idx: number, fb?: Map<string, AnswerFeedback>) => {
      // Discovery is ephemeral (browse-only, nothing scored) — it must never write a
      // localStorage active session. Short-circuit the single write choke point so no
      // discovery state can resume later.
      if (opts.mode === 'discovery') return
      // A taken-over tab must not overwrite the copy the new owner is writing.
      if (isTakenOver(opts.sessionId)) return
      writeActiveSession(buildActiveSession(opts, a, idx, fb))
    },
    [opts],
  )
  return { checkpoint }
}
