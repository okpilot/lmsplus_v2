import { markRunnerExiting } from './runner-exit'

/** Leaves the quiz for the picker; releases the leave guards first. The dialog's unmount clears the flag. */
export function backToQuizzes(replace: (href: string) => void): void {
  markRunnerExiting()
  replace('/app/quiz')
}

/** Reloads the page, which reclaims the session from the server; releases the leave guards first. */
export function continueHere(): void {
  markRunnerExiting()
  window.location.reload()
}
