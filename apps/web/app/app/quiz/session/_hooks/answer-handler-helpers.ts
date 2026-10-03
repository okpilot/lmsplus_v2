import { checkAnswer } from '../../actions/check-answer'
import { checkNonMcAnswer } from '../../actions/check-non-mc-answer'
import { isDisplayableProgressError } from '../../actions/progress-error-messages'
import type { AnswerFeedback, CheckNonMcAnswerResult, DraftAnswer } from '../../types'
import { withTakeoverCheck } from '../_utils/claim-quiz-device'
import { clampTimeSpent } from '../_utils/progress-save'
import { getQuizDeviceId } from '../_utils/quiz-device-id'
import { isTakenOver } from '../_utils/session-takeover'

// CheckResult is the already-shaped discriminated feedback the handlers build
// from each Server Action result (MC / short_answer / dialog_fill). It is
// structurally an AnswerFeedback variant, so recordAnswerFeedback stores it
// directly — the per-type construction lives in these builders, keyed off the
// questionType tag.
export type CheckResult = AnswerFeedback

const GENERIC_CHECK_ERROR = 'Failed to check answer. Please try again.'

/** Student-facing copy for a failed check: mapped server copy, else the generic message. */
export function checkErrorMessage(err: unknown): string {
  return err instanceof Error && isDisplayableProgressError(err.message)
    ? err.message
    : GENERIC_CHECK_ERROR
}

// One per-answer attempt: optimistic draft + a check that returns the
// already-shaped discriminated feedback, or throws on failure.
export type AttemptInput = {
  draft: DraftAnswer
  check: (questionId: string) => Promise<CheckResult>
}

type NonMcQuestionType = Exclude<CheckResult['questionType'], 'multiple_choice'>

// Shared non-MC check wrapper: call the Server Action, throw on failure or a mismatched
// questionType, and drop the success flag (feedback already carries questionType).
async function checkNonMc(
  questionType: NonMcQuestionType,
  call: Promise<CheckNonMcAnswerResult>,
): Promise<CheckResult> {
  const r = await call
  if (!r.success) throw new Error(r.error)
  if (r.questionType !== questionType) throw new Error('check failed')
  const { success: _success, ...feedback } = r
  return feedback
}

type HandlerDeps = {
  sessionId: string
  getAnswerStartTime: () => number
  runAttempt: (input: AttemptInput) => Promise<boolean>
}

// Progress meta every check call carries: the tab's device id and this visit's elapsed time.
function progressMeta(sessionId: string, ms: number) {
  return { sessionId, deviceId: getQuizDeviceId(), timeSpentMs: clampTimeSpent(ms) }
}

function attemptSelect(deps: HandlerDeps, optionId: string): Promise<boolean> {
  const responseTimeMs = Date.now() - deps.getAnswerStartTime()
  return deps.runAttempt({
    draft: { selectedOptionId: optionId, responseTimeMs },
    check: async (questionId) => {
      const r = await withTakeoverCheck(deps.sessionId, () =>
        checkAnswer({
          questionId,
          selectedOptionId: optionId,
          ...progressMeta(deps.sessionId, responseTimeMs),
        }),
      )
      if (!r.success) throw new Error(r.error)
      // Strip the server-action success flag so it doesn't leak into the
      // persisted AnswerFeedback (which carries no `success` field).
      const { success: _success, ...feedback } = r
      return { questionType: 'multiple_choice', ...feedback }
    },
  })
}

type NonMcAttempt = {
  questionType: NonMcQuestionType
  /** The answer field(s) shared by the optimistic draft and the Server Action payload. */
  answer: Omit<DraftAnswer, 'responseTimeMs'>
}

function attemptNonMc(deps: HandlerDeps, attempt: NonMcAttempt): Promise<boolean> {
  const responseTimeMs = Date.now() - deps.getAnswerStartTime()
  return deps.runAttempt({
    draft: { ...attempt.answer, responseTimeMs },
    check: (questionId) =>
      checkNonMc(
        attempt.questionType,
        withTakeoverCheck(deps.sessionId, () =>
          checkNonMcAnswer({
            questionId,
            ...progressMeta(deps.sessionId, responseTimeMs),
            ...attempt.answer,
          }),
        ),
      ),
  })
}

// Builds the per-type submit handlers. Each wraps a Server Action call in the shared
// optimistic/lock/revert machinery via `runAttempt`. Pure given its args — keeps the hook body
// lean (code-style.md §1 hook cap).
export function buildAnswerHandlers(deps: HandlerDeps) {
  return {
    handleSelectAnswer: (optionId: string) => attemptSelect(deps, optionId),
    handleTextAnswer: (responseText: string) =>
      attemptNonMc(deps, { questionType: 'short_answer', answer: { responseText } }),
    handleDialogFillAnswer: (blankAnswers: { index: number; text: string }[]) =>
      attemptNonMc(deps, { questionType: 'dialog_fill', answer: { blankAnswers } }),
    handleOrderingAnswer: (order: string[]) =>
      attemptNonMc(deps, { questionType: 'ordering', answer: { order } }),
    handleDiagramLabelAnswer: (mapping: { zoneId: string; labelId: string }[]) =>
      attemptNonMc(deps, { questionType: 'diagram_label', answer: { mapping } }),
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

type AnswerErrorOpts = {
  sessionId: string
  questionId: string
  lockedRef: React.MutableRefObject<Set<string>>
  pendingQuestionIdRef: React.MutableRefObject<Set<string>>
  /** Must be the same ref whose .current `setAnswers` writes back to — coupled, not independent. */
  answersRef: React.MutableRefObject<Map<string, DraftAnswer>>
  setAnswers: React.Dispatch<React.SetStateAction<Map<string, DraftAnswer>>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  onAnswerReverted?: (answers: Map<string, DraftAnswer>) => void
  message?: string
}

/** Rolls back optimistic answer state when checkAnswer fails. */
export function handleAnswerError(opts: AnswerErrorOpts) {
  const { questionId, lockedRef, pendingQuestionIdRef, answersRef } = opts
  pendingQuestionIdRef.current.delete(questionId)
  lockedRef.current.delete(questionId)
  // The checkpoint gets a map built now: React may run the updater below only after this returns.
  const reverted = new Map(answersRef.current)
  reverted.delete(questionId)
  answersRef.current = reverted
  opts.setAnswers((p) => {
    const m = new Map(p)
    m.delete(questionId)
    answersRef.current = m
    return m
  })
  try {
    opts.onAnswerReverted?.(reverted)
  } catch (err) {
    console.warn('[use-answer-handler] Revert checkpoint failed (best-effort):', err)
  }
  if (isTakenOver(opts.sessionId)) return
  opts.setError(opts.message ?? GENERIC_CHECK_ERROR)
}
