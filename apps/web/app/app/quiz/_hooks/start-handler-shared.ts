/**
 * Shared pieces of the quiz/exam/study start handlers (code-style §6): every start
 * handler guards re-entry with a synchronous useRef one-shot lock, and every
 * retryable failure must release that lock in the same place it surfaces the error.
 */

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

/**
 * Prompts before overwriting an unfinished session. Returns true when there is no
 * session to lose or the user confirmed. Callers set their re-entry lock only AFTER
 * this returns true — a cancelled confirm must stay retryable.
 */
export function confirmStartOverwrite(
  existing: { subjectName?: string } | null,
  activityNoun: string,
): boolean {
  if (!existing) return true
  const suffix = existing.subjectName ? ` (${existing.subjectName})` : ''
  return globalThis.confirm(
    `You have an unfinished quiz${suffix}. Starting ${activityNoun} will lose it. Continue?`,
  )
}
