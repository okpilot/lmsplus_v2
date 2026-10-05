// One-time upload of answers a browser still holds in the legacy localStorage copy
// (removal tracked in #1453).
import { saveQuizAnswer } from '../../actions/quiz-progress'
import type { DraftAnswer } from '../../types'
import { withTakeoverCheck } from './claim-quiz-device'
import { buildAnswerInput } from './progress-save'
import { getQuizDeviceId } from './quiz-device-id'
import type { ActiveSession } from './quiz-session-storage'
import { withReconnect } from './with-reconnect'

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

/** Saves each answer in order through the tab's save queue; false at the first failure. Never throws. */
export async function uploadLocalAnswers(opts: {
  sessionId: string
  answers: Record<string, DraftAnswer>
}): Promise<boolean> {
  const deviceId = getQuizDeviceId()
  try {
    for (const [questionId, draft] of Object.entries(opts.answers)) {
      const input = buildAnswerInput({
        sessionId: opts.sessionId,
        deviceId,
        questionId,
        draft,
        timeSpentMs: draft.responseTimeMs,
      })
      if (!input) continue
      const result = await withTakeoverCheck(opts.sessionId, () =>
        withReconnect(() => saveQuizAnswer(input)),
      )
      if (!result.success) return false
    }
    return true
  } catch (err) {
    console.warn('[local-answer-upload] upload failed (will retry next load):', err)
    return false
  }
}
