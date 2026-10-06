import { INVALID_INPUT, isDisplayableProgressError } from '../../actions/progress-error-messages'
import { setConnectionStatus } from './connection-state'
import type { Hold } from './hold-types'

type Verdict = 'retry' | 'done'

const RETRY_DELAYS_MS = [2000, 4000]

let choose: ((verdict: Verdict) => void) | null = null

/** @internal Test-only reset for the pending choice. */
export function _resetRefusedSave() {
  choose = null
}

/** True for a failed answer save whose cause is unmapped copy: a resend may succeed. Mapped refusals and a failed input parse are final and shown inline. */
export function isTransientRefusal(error: string): boolean {
  return !isDisplayableProgressError(error) && error !== INVALID_INPUT
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

type SaveResult = { success: boolean; error?: string }

type AnswerHold = Hold<SaveResult> & {
  /** True once the student chose Continue without it for this save. */
  skipped: boolean
}

/** Builds the `hold` for ONE answer save: retry a transient failure (unmapped refusal or a thrown save) twice, then wait for the student. */
export function refusedAnswerHold(): AnswerHold {
  let retries = 0
  const hold: AnswerHold = Object.assign(
    async (outcome: Parameters<AnswerHold>[0]): Promise<Verdict> => {
      if (outcome.kind === 'value') {
        const { success, error } = outcome.value
        if (success || typeof error !== 'string' || !isTransientRefusal(error)) return 'done'
      }
      const delay = RETRY_DELAYS_MS[retries]
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
