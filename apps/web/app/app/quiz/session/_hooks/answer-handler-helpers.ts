import { checkAnswer } from '../../actions/check-answer'
import { checkNonMcAnswer } from '../../actions/check-non-mc-answer'
import type { AnswerFeedback, DraftAnswer } from '../../types'

// CheckResult is the already-shaped discriminated feedback the handlers build
// from each Server Action result (MC / short_answer / dialog_fill). It is
// structurally an AnswerFeedback variant, so recordAnswerFeedback stores it
// directly — the per-type construction lives in these builders, keyed off the
// questionType tag.
export type CheckResult = AnswerFeedback

// One per-answer attempt: optimistic draft + a check that returns the
// already-shaped discriminated feedback, or throws on failure.
export type AttemptInput = {
  draft: DraftAnswer
  check: (questionId: string) => Promise<CheckResult>
}

// Builds the three per-type submit handlers. Each wraps a Server Action call in
// the shared optimistic/lock/revert machinery via `runAttempt`. Pure given its
// args — keeps the hook body lean (code-style.md §1 hook cap).
export function buildAnswerHandlers(deps: {
  sessionId: string
  getAnswerStartTime: () => number
  runAttempt: (input: AttemptInput) => Promise<boolean>
}) {
  const { sessionId, getAnswerStartTime, runAttempt } = deps

  function handleSelectAnswer(optionId: string): Promise<boolean> {
    const responseTimeMs = Date.now() - getAnswerStartTime()
    return runAttempt({
      draft: { selectedOptionId: optionId, responseTimeMs },
      check: async (questionId) => {
        const r = await checkAnswer({ questionId, selectedOptionId: optionId, sessionId })
        if (!r.success) throw new Error(r.error)
        // Strip the server-action success flag so it doesn't leak into the
        // persisted AnswerFeedback (which carries no `success` field).
        const { success: _success, ...feedback } = r
        return { questionType: 'multiple_choice', ...feedback }
      },
    })
  }

  function handleTextAnswer(text: string): Promise<boolean> {
    const responseTimeMs = Date.now() - getAnswerStartTime()
    return runAttempt({
      draft: { responseText: text, responseTimeMs },
      check: async (questionId) => {
        const r = await checkNonMcAnswer({ questionId, sessionId, responseText: text })
        if (!r.success || r.questionType !== 'short_answer') throw new Error('check failed')
        // feedback already carries questionType; drop the success flag.
        const { success: _success, ...feedback } = r
        return feedback
      },
    })
  }

  function handleDialogFillAnswer(
    blankAnswers: { index: number; text: string }[],
  ): Promise<boolean> {
    const responseTimeMs = Date.now() - getAnswerStartTime()
    return runAttempt({
      draft: { blankAnswers, responseTimeMs },
      check: async (questionId) => {
        const r = await checkNonMcAnswer({ questionId, sessionId, blankAnswers })
        if (!r.success || r.questionType !== 'dialog_fill') throw new Error('check failed')
        // feedback already carries questionType; drop the success flag.
        const { success: _success, ...feedback } = r
        return feedback
      },
    })
  }

  function handleOrderingAnswer(order: string[]): Promise<boolean> {
    const responseTimeMs = Date.now() - getAnswerStartTime()
    return runAttempt({
      draft: { order, responseTimeMs },
      check: async (questionId) => {
        const r = await checkNonMcAnswer({ questionId, sessionId, order })
        if (!r.success || r.questionType !== 'ordering') throw new Error('check failed')
        // feedback already carries questionType; drop the success flag.
        const { success: _success, ...feedback } = r
        return feedback
      },
    })
  }

  function handleDiagramLabelAnswer(
    mapping: { zoneId: string; labelId: string }[],
  ): Promise<boolean> {
    const responseTimeMs = Date.now() - getAnswerStartTime()
    return runAttempt({
      draft: { mapping, responseTimeMs },
      check: async (questionId) => {
        const r = await checkNonMcAnswer({ questionId, sessionId, mapping })
        if (!r.success || r.questionType !== 'diagram_label') throw new Error('check failed')
        // feedback already carries questionType; drop the success flag.
        const { success: _success, ...feedback } = r
        return feedback
      },
    })
  }

  return {
    handleSelectAnswer,
    handleTextAnswer,
    handleDialogFillAnswer,
    handleOrderingAnswer,
    handleDiagramLabelAnswer,
  }
}

export function recordAnswerFeedback(
  questionId: string,
  result: CheckResult,
  feedbackRef: React.MutableRefObject<Map<string, AnswerFeedback>>,
  setFeedback: React.Dispatch<React.SetStateAction<Map<string, AnswerFeedback>>>,
): Map<string, AnswerFeedback> {
  const next = new Map(feedbackRef.current).set(questionId, result)
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
