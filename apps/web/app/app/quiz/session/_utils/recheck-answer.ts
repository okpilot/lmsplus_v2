import { checkAnswer } from '../../actions/check-answer'
import { checkNonMcAnswer } from '../../actions/check-non-mc-answer'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { withTakeoverCheck } from './claim-quiz-device'
import { buildAnswerInput } from './progress-save'
import { getQuizDeviceId } from './quiz-device-id'
import { withReconnect } from './with-reconnect'

type Opts = { sessionId: string; questionId: string; answer: DraftAnswer }

/**
 * Re-runs the practice check for a restored answer to get its feedback back. Sends no visit
 * time, so the stored time is untouched. Returns null on any failure; never throws.
 */
export async function recheckAnswer(opts: Opts): Promise<AnswerFeedback | null> {
  const { sessionId, questionId, answer } = opts
  const deviceId = getQuizDeviceId()
  const input = buildAnswerInput({ sessionId, deviceId, questionId, draft: answer, timeSpentMs: 0 })
  if (!input) return null
  try {
    if ('selectedOptionId' in input.answer) {
      const selectedOptionId = input.answer.selectedOptionId
      const r = await withTakeoverCheck(sessionId, () =>
        withReconnect(() => checkAnswer({ questionId, selectedOptionId, sessionId, deviceId })),
      )
      if (!r.success) return null
      const { success: _success, ...feedback } = r
      return { questionType: 'multiple_choice', ...feedback }
    }
    const r = await withTakeoverCheck(sessionId, () =>
      withReconnect(() => checkNonMcAnswer({ questionId, sessionId, deviceId, ...input.answer })),
    )
    if (!r.success) return null
    const { success: _success, ...feedback } = r
    return feedback
  } catch {
    return null
  }
}
