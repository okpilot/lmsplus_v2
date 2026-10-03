import { isDisplayableProgressError } from '../../actions/progress-error-messages'
import { saveQuizAnswer, saveQuizPosition } from '../../actions/quiz-progress'
import type { DraftAnswer } from '../../types'
import { withTakeoverCheck } from './claim-quiz-device'
import { isTakenOver } from './session-takeover'

const MAX_TIME_SPENT_MS = 86_400_000

/** Clamps a visit duration into the server's accepted 0..86_400_000 integer range. */
export function clampTimeSpent(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.min(Math.floor(ms), MAX_TIME_SPENT_MS)
}

type AnswerInputOpts = {
  sessionId: string
  deviceId: string
  questionId: string
  draft: Omit<DraftAnswer, 'responseTimeMs'>
  timeSpentMs: number
}

/** Maps a local draft to the saveQuizAnswer payload; null when the draft carries no answer. */
export function buildAnswerInput(opts: AnswerInputOpts) {
  const { draft } = opts
  const answer = pickAnswer(draft)
  if (!answer) return null
  return {
    sessionId: opts.sessionId,
    questionId: opts.questionId,
    deviceId: opts.deviceId,
    answer,
    timeSpentMs: clampTimeSpent(opts.timeSpentMs),
  }
}

function pickAnswer(draft: Omit<DraftAnswer, 'responseTimeMs'>) {
  if (draft.selectedOptionId !== undefined) return { selectedOptionId: draft.selectedOptionId }
  if (draft.responseText !== undefined) return { responseText: draft.responseText }
  if (Array.isArray(draft.blankAnswers)) return { blankAnswers: draft.blankAnswers }
  if (Array.isArray(draft.order)) return { order: draft.order }
  if (Array.isArray(draft.mapping)) return { mapping: draft.mapping }
  return null
}

type PositionInputOpts = {
  sessionId: string
  deviceId: string
  currentIndex: number
  pinnedQuestionIds: Iterable<string>
  leaving?: { questionId: string; timeSpentMs: number }
}

/** Builds the saveQuizPosition payload: the new index, the pins, and the question being left. */
export function buildPositionInput(opts: PositionInputOpts) {
  return {
    sessionId: opts.sessionId,
    deviceId: opts.deviceId,
    currentIndex: opts.currentIndex,
    pinnedQuestionIds: [...opts.pinnedQuestionIds],
    ...(opts.leaving && {
      leaving: {
        questionId: opts.leaving.questionId,
        timeSpentMs: clampTimeSpent(opts.leaving.timeSpentMs),
      },
    }),
  }
}

type SaveKind = 'answer' | 'position'

/**
 * Fire-and-forget progress save. Never throws and is never awaited by callers. A mapped
 * (displayable) failure goes to onMappedError; anything else is a console.warn only.
 */
export function fireProgressSave(opts: {
  kind: SaveKind
  sessionId: string
  input: unknown
  onSuccess: () => void
  onMappedError: (message: string) => void
}): void {
  if (isTakenOver(opts.sessionId)) return
  const save = opts.kind === 'answer' ? saveQuizAnswer : saveQuizPosition
  withTakeoverCheck(opts.sessionId, () => save(opts.input))
    .then((r) => {
      if (r.success) return opts.onSuccess()
      if (isDisplayableProgressError(r.error)) return opts.onMappedError(r.error)
      console.warn(`[progress-save] ${opts.kind} save failed (best-effort):`, r.error)
    })
    .catch((err) => console.warn(`[progress-save] ${opts.kind} save failed (best-effort):`, err))
}
