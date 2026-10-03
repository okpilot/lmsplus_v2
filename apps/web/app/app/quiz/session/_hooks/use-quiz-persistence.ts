import { useCallback, useEffect, useRef } from 'react'
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

/**
 * Writes the starting state once on mount. Start and Resume leave no local copy until the
 * first answer, so a reload or a takeover kick in that window would lose the Resume option.
 */
export function useInitialCheckpoint(opts: QuizStateOpts, currentIndexRef: { current: number }) {
  const { checkpoint } = useQuizPersistence(opts)
  const doneRef = useRef(false)
  useEffect(() => {
    if (doneRef.current) return
    doneRef.current = true
    const answers = new Map(Object.entries(opts.initialAnswers ?? {}))
    checkpoint(answers, currentIndexRef.current, opts.initialFeedback)
  }, [checkpoint, opts, currentIndexRef])
}
