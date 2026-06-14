import { useEffect, useRef, useState } from 'react'
import { checkAnswer } from '../../actions/check-answer'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { type CheckResult, handleAnswerError, recordAnswerFeedback } from './answer-handler-helpers'

type AnswerHandlerOpts = {
  sessionId: string
  getQuestionId: () => string
  getAnswerStartTime: () => number
  answers: Map<string, DraftAnswer>
  setAnswers: React.Dispatch<React.SetStateAction<Map<string, DraftAnswer>>>
  initialFeedback?: Map<string, AnswerFeedback>
  onAnswerRecorded?: (
    answers: Map<string, DraftAnswer>,
    feedback: Map<string, AnswerFeedback>,
  ) => void
  onAnswerReverted?: (answers: Map<string, DraftAnswer>) => void
}

export function useAnswerHandler(opts: AnswerHandlerOpts) {
  const {
    sessionId,
    getQuestionId,
    getAnswerStartTime,
    answers,
    setAnswers,
    initialFeedback,
    onAnswerRecorded,
    onAnswerReverted,
  } = opts
  const [feedback, setFeedback] = useState<Map<string, AnswerFeedback>>(
    () => initialFeedback ?? new Map(),
  )
  const [error, setError] = useState<string | null>(null)
  // > 0 while one or more per-question checkAnswer RPCs are in flight. Drives the
  // Submit Answer spinner AND (since #886) keeps the footer submit button mounted.
  // A counter, not a boolean: if the user navigates mid-RPC and answers the next
  // question before the first settles, both are in flight — the counter stays
  // positive until the LAST settles, so the first settle can't clear the loading
  // state early. Distinct from the session-level `submitting` from useQuizSubmit.
  const [inFlightAnswers, setInFlightAnswers] = useState(0)
  const answering = inFlightAnswers > 0
  const lockedRef = useRef<Set<string>>(new Set())
  const pendingQuestionIdRef = useRef<Set<string>>(new Set())
  const answersRef = useRef(answers)
  answersRef.current = answers
  const feedbackRef = useRef(feedback)
  feedbackRef.current = feedback

  async function handleSelectAnswer(optionId: string): Promise<boolean> {
    const questionId = getQuestionId()
    if (lockedRef.current.has(questionId) || answers.has(questionId)) return false
    lockedRef.current.add(questionId)
    const elapsed = Date.now() - getAnswerStartTime()
    setAnswers((p) => {
      const next = new Map(p).set(questionId, {
        selectedOptionId: optionId,
        responseTimeMs: elapsed,
      })
      answersRef.current = next
      return next
    })
    pendingQuestionIdRef.current.add(questionId)
    setInFlightAnswers((n) => n + 1)
    // finally guarantees the counter is decremented on every exit path (RPC
    // error, success, or a throw from recordAnswerFeedback), so `answering`
    // can never get stuck positive.
    try {
      let result: CheckResult
      try {
        const r = await checkAnswer({ questionId, selectedOptionId: optionId, sessionId })
        if (!r.success) throw new Error(r.error)
        result = r
      } catch {
        handleAnswerError(
          questionId,
          lockedRef,
          pendingQuestionIdRef,
          answersRef,
          setAnswers,
          setError,
          onAnswerReverted,
        )
        return false
      }
      const nextFeedback = recordAnswerFeedback(questionId, result, feedbackRef, setFeedback)
      setError(null)
      try {
        onAnswerRecorded?.(
          new Map(answersRef.current).set(questionId, {
            selectedOptionId: optionId,
            responseTimeMs: elapsed,
          }),
          nextFeedback,
        )
      } catch (err) {
        console.warn('[use-answer-handler] Checkpoint write failed (best-effort):', err)
      }
      return true
    } finally {
      // Both run on every exit path. Decrementing the counter keeps `answering`
      // from sticking positive; clearing the in-flight marker keeps this question
      // from orphaning in pendingQuestionIdRef (which would drop it from submit) if
      // recordAnswerFeedback ever throws. Idempotent on the error path —
      // handleAnswerError already deleted it; Set.delete of an absent key is a no-op.
      pendingQuestionIdRef.current.delete(questionId)
      setInFlightAnswers((n) => Math.max(0, n - 1))
    }
  }

  // Clear ref lock reactively after state update propagates — not data fetching
  useEffect(() => {
    for (const locked of lockedRef.current) {
      if (!answers.has(locked)) lockedRef.current.delete(locked)
    }
  }, [answers])

  return {
    feedback,
    error,
    answering,
    handleSelectAnswer,
    clearError: () => setError(null),
    pendingQuestionIdRef,
  }
}
