import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { recheckAnswer } from '../_utils/recheck-answer'

type Opts = {
  /** Practice modes only; an exam never re-checks. */
  enabled: boolean
  sessionId: string
  questionId: string
  /** The answers the runner was seeded with (server or local draft): the only ones eligible for a re-check. */
  restorable: Record<string, DraftAnswer> | undefined
  answers: Map<string, DraftAnswer>
  feedback: Map<string, AnswerFeedback>
}

/**
 * Gets the feedback of a restored practice answer back by re-checking it once, when its question
 * is first on screen. A failed re-check leaves the question answered without feedback. Returns
 * the restored feedback merged under the live feedback.
 */
export function useRestoredFeedback(opts: Readonly<Opts>): Map<string, AnswerFeedback> {
  const { enabled, sessionId, questionId, restorable, answers, feedback } = opts
  const [restored, setRestored] = useState<Map<string, AnswerFeedback>>(new Map())
  const attemptedRef = useRef<Set<string>>(new Set())
  const draft = restorable?.[questionId]
  const eligible = enabled && !!draft && answers.has(questionId) && !feedback.has(questionId)

  useEffect(() => {
    if (!eligible || !draft || attemptedRef.current.has(questionId)) return
    attemptedRef.current.add(questionId)
    recheckAnswer({ sessionId, questionId, answer: draft })
      .then((fb) => fb && setRestored((prev) => new Map(prev).set(questionId, fb)))
      .catch(() => undefined)
  }, [eligible, draft, sessionId, questionId])

  return useMemo(() => new Map([...restored, ...feedback]), [restored, feedback])
}
