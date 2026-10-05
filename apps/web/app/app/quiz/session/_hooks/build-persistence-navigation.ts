type Opts = {
  navigateTo: (index: number) => void
  getCurrentIndex: () => number
  clearAnswerError: () => void
  clearSubmitError: () => void
}

/** Navigation that drops a stale answer/submit error before moving. */
export function buildPersistenceNavigation({
  navigateTo,
  getCurrentIndex,
  clearAnswerError,
  clearSubmitError,
}: Opts) {
  const wrappedNavigateTo = (index: number) => {
    clearAnswerError()
    clearSubmitError()
    navigateTo(index)
  }

  const wrappedNavigate = (d: number) => wrappedNavigateTo(getCurrentIndex() + d)

  return { navigateTo: wrappedNavigateTo, navigate: wrappedNavigate }
}
