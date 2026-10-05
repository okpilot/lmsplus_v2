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
 * Every call joins the action queue at once, so an answer saved later runs after all of them
 * and no re-check can overwrite it. Sends no visit time, so stored time is untouched. Keeps
 * the feedback of the calls that succeed; never throws.
 */
export async function recheckAnswers(opts: Opts): Promise<Map<string, AnswerFeedback>> {
  const out = new Map<string, AnswerFeedback>()
  const deviceId = getQuizDeviceId()
  const calls = chunk(buildItems({ ...opts, deviceId })).map((answers) =>
    withTakeoverCheck(opts.sessionId, () =>
      withReconnect(() => recheckRestoredAnswers({ sessionId: opts.sessionId, deviceId, answers })),
    ),
  )
  for (const r of await Promise.allSettled(calls)) {
    if (r.status !== 'fulfilled' || !r.value.success) continue
    for (const [id, fb] of Object.entries(r.value.feedback)) out.set(id, fb)
  }
  return out
}
