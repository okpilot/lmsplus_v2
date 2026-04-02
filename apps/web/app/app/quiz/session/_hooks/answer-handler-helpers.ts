import type { AnswerFeedback, DraftAnswer } from '../../types'

export type CheckResult = {
  isCorrect: boolean
  correctOptionId: string
  explanationText: string | null
  explanationImageUrl: string | null
}

export function recordAnswerFeedback(
  questionId: string,
  result: CheckResult,
  feedbackRef: React.MutableRefObject<Map<string, AnswerFeedback>>,
  setFeedback: React.Dispatch<React.SetStateAction<Map<string, AnswerFeedback>>>,
): Map<string, AnswerFeedback> {
  const next = new Map(feedbackRef.current).set(questionId, {
    isCorrect: result.isCorrect,
    correctOptionId: result.correctOptionId,
    explanationText: result.explanationText,
    explanationImageUrl: result.explanationImageUrl,
  })
  feedbackRef.current = next
  setFeedback(next)
  return next
}

/**
 * Rolls back optimistic answer state when checkAnswer fails.
 * Infrastructure helper coordinating multiple React state refs and setters.
 * @param answersRef Must be the same ref whose .current the setAnswers updater
 *   writes back to — these two parameters are coupled, not independent.
 */
export function handleAnswerError(
  questionId: string,
  lockedRef: React.MutableRefObject<Set<string>>,
  pendingQuestionIdRef: React.MutableRefObject<Set<string>>,
  answersRef: React.MutableRefObject<Map<string, DraftAnswer>>,
  setAnswers: React.Dispatch<React.SetStateAction<Map<string, DraftAnswer>>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  onAnswerReverted?: (answers: Map<string, DraftAnswer>) => void,
) {
  pendingQuestionIdRef.current.delete(questionId)
  lockedRef.current.delete(questionId)
  setAnswers((p) => {
    const m = new Map(p)
    m.delete(questionId)
    answersRef.current = m
    return m
  })
  try {
    onAnswerReverted?.(answersRef.current)
  } catch (err) {
    console.warn('[use-answer-handler] Revert checkpoint failed (best-effort):', err)
  }
  setError('Failed to check answer. Please try again.')
}
