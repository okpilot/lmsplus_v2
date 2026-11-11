import { markRunnerExiting } from './runner-exit'
import { clearTakenOver } from './session-takeover'

/** Leaves the quiz for the picker; releases the leave guards first. */
export function backToQuizzes(sessionId: string, replace: (href: string) => void): void {
  clearTakenOver(sessionId)
  markRunnerExiting()
  replace('/app/quiz')
}

/** Reloads the page, which reclaims the session from the server; releases the leave guards first. */
export function continueHere(): void {
  markRunnerExiting()
  window.location.reload()
}
