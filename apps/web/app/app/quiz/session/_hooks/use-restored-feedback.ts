import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { recheckAnswers } from '../_utils/recheck-answers'

type Opts = {
  /** Practice modes only; an exam never re-checks. */
  enabled: boolean
  sessionId: string
  /** The answers the runner was seeded with (server or local draft): the only ones eligible for a re-check. */
  restorable: Record<string, DraftAnswer> | undefined
  answers: Map<string, DraftAnswer>
  feedback: Map<string, AnswerFeedback>
}

/**
 * Gets the feedback of every restored practice answer back by grading them all once, on mount,
 * so each navigator button is coloured before its question is visited. A failed grading leaves
 * the answers without feedback and is not retried. Returns the restored feedback merged under
 * the live feedback.
 */
export function useRestoredFeedback(opts: Readonly<Opts>): Map<string, AnswerFeedback> {
  const { enabled, sessionId, restorable, answers, feedback } = opts
  const [restored, setRestored] = useState<Map<string, AnswerFeedback>>(new Map())
  const startedRef = useRef(false)
  const hasRestorable = !!restorable && Object.keys(restorable).length > 0

  useEffect(() => {
    if (!enabled || !hasRestorable || !restorable || startedRef.current) return
    startedRef.current = true
    recheckAnswers({ sessionId, restorable })
      .then(setRestored)
      .catch(() => undefined)
  }, [enabled, hasRestorable, restorable, sessionId])

  return useMemo(() => {
    const kept = [...restored].filter(([id]) => answers.has(id))
    return new Map([...kept, ...feedback])
  }, [restored, answers, feedback])
}
