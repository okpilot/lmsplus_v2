/** Leaves the quiz for the picker. The dialog's unmount clears the flag. */
export function backToQuizzes(replace: (href: string) => void): void {
  replace('/app/quiz')
}

/** Reloads the page, which reclaims the session from the server. */
export function continueHere(): void {
  window.location.reload()
}
