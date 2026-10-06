/**
 * Shared pieces of the quiz/exam/study start handlers (code-style §6): every start
 * handler guards re-entry with a synchronous useRef one-shot lock, and every
 * retryable failure must release that lock in the same place it surfaces the error.
 */

import { getActivePracticeSession } from '../actions/get-active-practice-session'

export type StartFailureState = {
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  inFlight: React.RefObject<boolean>
}

/**
 * Retryable-failure path: surface the message, clear the UI loading flag, and
 * release the synchronous re-entry lock so the user can try again. Terminal
 * successes never call this — the lock intentionally stays engaged while the
 * router navigates away.
 */
export function failStart(state: StartFailureState, message: string): void {
  state.setError(message)
  state.setLoading(false)
  state.inFlight.current = false
}

export type BlockedOffer = { sessionId: string; subjectName: string }

type BlockedAwareState = StartFailureState & {
  setBlocked: (offer: BlockedOffer | null) => void
}

/**
 * A start refused with `blocked` means another session is open. When that session is a
 * practice quiz, offer to save it for later; any other blocker (an exam) gets the message only.
 */
async function offerBlockerSave(setBlocked: BlockedAwareState['setBlocked']): Promise<void> {
  try {
    const active = await getActivePracticeSession()
    if (active.success && active.session) {
      setBlocked({ sessionId: active.session.sessionId, subjectName: active.session.subjectName })
    }
  } catch (err) {
    console.warn('[start-handler-shared] blocker lookup failed:', err)
  }
}

/** Retryable start failure from a start action result, with the blocked-start offer. */
export async function reportStartFailure(
  state: BlockedAwareState,
  result: { error: string; blocked?: true },
): Promise<void> {
  if (result.blocked) await offerBlockerSave(state.setBlocked)
  failStart(state, result.error)
}
