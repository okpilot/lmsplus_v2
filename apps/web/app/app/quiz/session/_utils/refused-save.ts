import {
  isDisplayableProgressError,
  PROGRESS_ERROR_MESSAGES,
} from '../../actions/progress-error-messages'
import { setConnectionStatus } from './connection-state'

type Verdict = 'retry' | 'done'
export type RefusalClass = 'transient' | 'per-answer' | 'session-wide'

const RETRY_DELAYS_MS = [2000, 4000]

// Copy of a refusal of ONE answer that a resend cannot change. Progress copy is shared with
// `invalid_position` / `invalid_device`, which save_quiz_answer never raises.
const PER_ANSWER = new Set([
  PROGRESS_ERROR_MESSAGES.invalid_answer,
  PROGRESS_ERROR_MESSAGES.question_not_in_session,
  PROGRESS_ERROR_MESSAGES.invalid_time_spent,
  'Invalid input',
])

let choose: ((verdict: Verdict) => void) | null = null

/** @internal Test-only reset for the pending choice. */
export function _resetRefusedSave() {
  choose = null
}

/** Splits a failed answer save: unmapped copy is transient, the per-answer set is held, other mapped copy is session-wide. */
export function refusalClass(error: string): RefusalClass {
  if (PER_ANSWER.has(error)) return 'per-answer'
  return isDisplayableProgressError(error) ? 'session-wide' : 'transient'
}

function chosen(): Promise<Verdict> {
  setConnectionStatus('save-failed')
  return new Promise((resolve) => {
    choose = (verdict) => {
      choose = null
      setConnectionStatus('ok')
      resolve(verdict)
    }
  })
}

/** The student pressed Try again: the held save is sent again. */
export function retryRefusedSave() {
  choose?.('retry')
}

/** The student pressed Continue without it: the held save is dropped. */
export function skipRefusedSave() {
  choose?.('done')
}

type AnswerHold = ((value: { success: boolean; error?: string }) => Promise<Verdict>) & {
  /** True once the student chose Continue without it for this save. */
  skipped: boolean
}

/** Builds the `hold` for ONE answer save: retry a transient refusal twice, then wait for the student. */
export function refusedAnswerHold(): AnswerHold {
  let retries = 0
  const hold: AnswerHold = Object.assign(
    async (value: { success: boolean; error?: string }): Promise<Verdict> => {
      if (value.success || typeof value.error !== 'string') return 'done'
      const kind = refusalClass(value.error)
      if (kind === 'session-wide') return 'done'
      const delay = kind === 'transient' ? RETRY_DELAYS_MS[retries] : undefined
      if (delay === undefined) {
        const verdict = await chosen()
        if (verdict === 'done') hold.skipped = true
        return verdict
      }
      retries += 1
      await new Promise((resolve) => setTimeout(resolve, delay))
      return 'retry'
    },
    { skipped: false },
  )
  return hold
}
