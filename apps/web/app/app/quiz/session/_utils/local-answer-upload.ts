// One-time upload of answers a browser still holds in the legacy localStorage copy
// (removal tracked in #1453).
import { PROGRESS_ERROR_MESSAGES } from '../../actions/progress-error-messages'
import { saveQuizAnswer } from '../../actions/quiz-progress'
import type { DraftAnswer } from '../../types'
import { withTakeoverCheck } from './claim-quiz-device'
import { buildAnswerInput } from './progress-save'
import { getQuizDeviceId } from './quiz-device-id'
import type { ActiveSession } from './quiz-session-storage'
import { withReconnect } from './with-reconnect'

// Mapped copy (not RPC tokens) of a refusal of ONE answer; any other failure aborts the upload.
// BAD_ANSWER copy is shared, but save_quiz_answer raises only `invalid_answer` from that group.
// Progress copy stays out: it also maps the session-wide `invalid_device` / `invalid_position`.
const SKIPPABLE = new Set([
  PROGRESS_ERROR_MESSAGES.invalid_answer,
  PROGRESS_ERROR_MESSAGES.question_not_in_session,
  'Invalid input',
])

type FindOpts = {
  stored: ActiveSession | null
  sessionId: string
  serverAnswers: Record<string, DraftAnswer>
  questionIds: readonly string[]
}

/** Local answers of this session that the server lacks; the server wins where both exist. */
export function findLocalOnlyAnswers(opts: FindOpts): Record<string, DraftAnswer> {
  if (opts.stored?.sessionId !== opts.sessionId) return {}
  const inSession = new Set(opts.questionIds)
  return Object.fromEntries(
    Object.entries(opts.stored.answers).filter(
      ([id]) => inSession.has(id) && !(id in opts.serverAnswers),
    ),
  )
}

export type UploadResult = {
  /** Question ids the server accepted. */
  saved: string[]
  /** False when a session-wide failure (or a throw) stopped the upload. */
  complete: boolean
}

type SaveOutcome = 'saved' | 'skipped' | 'failed'

async function saveOne(opts: {
  sessionId: string
  deviceId: string
  questionId: string
  draft: DraftAnswer
}): Promise<SaveOutcome> {
  const input = buildAnswerInput({ ...opts, timeSpentMs: opts.draft.responseTimeMs })
  if (!input) return 'skipped'
  const result = await withTakeoverCheck(opts.sessionId, () =>
    withReconnect(() => saveQuizAnswer(input)),
  )
  if (result.success) return 'saved'
  if (!SKIPPABLE.has(result.error)) return 'failed'
  console.warn('[local-answer-upload] rejected answer skipped for question', opts.questionId)
  return 'skipped'
}

/**
 * Saves each answer in order; skips one the server refuses, stops at a session-wide failure.
 * `onSaved` reports each accepted id as it lands. `shouldStop` is checked before each save; when it
 * returns true the upload ends incomplete without sending the rest. Never throws.
 */
export async function uploadLocalAnswers(opts: {
  sessionId: string
  answers: Record<string, DraftAnswer>
  onSaved?: (questionId: string) => void
  shouldStop?: () => boolean
}): Promise<UploadResult> {
  const deviceId = getQuizDeviceId()
  const saved: string[] = []
  try {
    for (const [questionId, draft] of Object.entries(opts.answers)) {
      if (opts.shouldStop?.()) return { saved, complete: false }
      const outcome = await saveOne({ sessionId: opts.sessionId, deviceId, questionId, draft })
      if (outcome === 'failed') return { saved, complete: false }
      if (outcome === 'saved') {
        saved.push(questionId)
        opts.onSaved?.(questionId)
      }
    }
    return { saved, complete: true }
  } catch (err) {
    console.warn('[local-answer-upload] upload failed (will retry next load):', err)
    return { saved, complete: false }
  }
}
