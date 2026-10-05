import { recheckRestoredAnswers } from '../../actions/recheck-answers'
import { RECHECK_CHUNK } from '../../actions/recheck-answers-schema'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { withTakeoverCheck } from './claim-quiz-device'
import { buildAnswerInput } from './progress-save'
import { getQuizDeviceId } from './quiz-device-id'
import { withReconnect } from './with-reconnect'

type Opts = { sessionId: string; restorable: Record<string, DraftAnswer> }

function buildItems(opts: Opts & { deviceId: string }) {
  const items: Record<string, unknown>[] = []
  for (const [questionId, draft] of Object.entries(opts.restorable)) {
    const input = buildAnswerInput({
      sessionId: opts.sessionId,
      deviceId: opts.deviceId,
      questionId,
      draft,
      timeSpentMs: 0,
    })
    if (input) items.push({ questionId, ...input.answer })
  }
  return items
}

/** Splits the items into RECHECK_CHUNK-sized calls' answer lists. */
function chunk(items: Record<string, unknown>[]): Record<string, unknown>[][] {
  const out: Record<string, unknown>[][] = []
  for (let i = 0; i < items.length; i += RECHECK_CHUNK) out.push(items.slice(i, i + RECHECK_CHUNK))
  return out
}

/**
 * Grades every restored practice answer, RECHECK_CHUNK per call, to get its feedback back.
 * One call at a time, so a new answer save waits behind one call at most; no re-check can
 * overwrite it, because a restored question refuses a new answer. Sends no visit time, so
 * stored time is untouched. A call landing after finish is refused by the ended session.
 * Stops after a refused or failed call, or once the server reports the session done, and keeps
 * what was graded; never throws.
 */
export async function recheckAnswers(opts: Opts): Promise<Map<string, AnswerFeedback>> {
  const out = new Map<string, AnswerFeedback>()
  const deviceId = getQuizDeviceId()
  try {
    for (const answers of chunk(buildItems({ ...opts, deviceId }))) {
      const r = await withTakeoverCheck(opts.sessionId, () =>
        withReconnect(() =>
          recheckRestoredAnswers({ sessionId: opts.sessionId, deviceId, answers }),
        ),
      )
      if (!r.success) break
      for (const [id, fb] of Object.entries(r.feedback)) out.set(id, fb)
      if (r.done) break
    }
  } catch {
    return out
  }
  return out
}
