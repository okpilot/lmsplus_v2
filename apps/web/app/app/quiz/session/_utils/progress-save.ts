import { INVALID_INPUT, isDisplayableProgressError } from '../../actions/progress-error-messages'
import { saveQuizAnswer, saveQuizPosition } from '../../actions/quiz-progress'
import type { DraftAnswer } from '../../types'
import { withTakeoverCheck } from './claim-quiz-device'
import { getConnectionStatus } from './connection-state'
import { refusedAnswerHold } from './refused-save'
import { isTakenOver } from './session-takeover'
import { withReconnect } from './with-reconnect'

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

type SaveOutcome = 'saved' | 'rejected' | 'failed'

/**
 * Fire-and-forget progress save. Never throws or rejects; callers may ignore the result. Resolves:
 * - 'saved': the save succeeded.
 * - 'rejected': the server refused this input for good; re-sending cannot change it. A mapped
 *   failure goes to onMappedError.
 * - 'failed': anything else (transient failure, throw, taken-over session, signed-out user). A
 *   taken-over session and a signed-out user warn nothing; other failures console.warn.
 * An answer save carries a refused-save hold (refused-save.ts): a refused answer is retried or held,
 * with the save queue, until the student picks Try again or Continue without it.
 */
export async function fireProgressSave(opts: {
  kind: SaveKind
  sessionId: string
  input: unknown
  onSuccess: () => void
  onMappedError: (message: string) => void
}): Promise<SaveOutcome> {
  if (isTakenOver(opts.sessionId)) return 'failed'
  const save = opts.kind === 'answer' ? saveQuizAnswer : saveQuizPosition
  const hold = opts.kind === 'answer' ? refusedAnswerHold() : undefined
  try {
    const r = await withTakeoverCheck(opts.sessionId, () =>
      withReconnect(() => save(opts.input), hold),
    )
    if (r.success) {
      opts.onSuccess()
      return 'saved'
    }
    if (isTakenOver(opts.sessionId)) return 'failed'
    // The overlay already says the sign-in expired; no second message behind it.
    if (getConnectionStatus() === 'signed-out') return 'failed'
    if (isDisplayableProgressError(r.error)) {
      opts.onMappedError(r.error)
      return 'rejected'
    }
    console.warn(`[progress-save] ${opts.kind} save failed (best-effort):`, r.error)
    // Continue without it settles the answer: Finish must not resend it.
    if (hold?.skipped) return 'rejected'
    return r.error === INVALID_INPUT ? 'rejected' : 'failed'
  } catch (err) {
    console.warn(`[progress-save] ${opts.kind} save failed (best-effort):`, err)
    return 'failed'
  }
}
