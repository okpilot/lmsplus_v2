/**
 * Races `promise` against a timer. If the timer fires first, `fallback` is
 * returned instead of waiting forever — #911 use: a hung Server Component
 * query resolves to a failure-shaped fallback so the caller's existing error
 * path renders instead of streaming the skeleton indefinitely.
 *
 * The timer is cleared when `promise` settles first, so no dangling timer
 * keeps the process alive.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>
  const timerPromise = new Promise<T>((resolve) => {
    timerId = setTimeout(() => resolve(fallback), ms)
  })
  // Clear the timer when the real promise wins (either way) so no dangling
  // timer reference lingers in the event loop.
  const guarded = promise.finally(() => clearTimeout(timerId))
  // If the timer wins the race, `guarded` is still pending and may reject later
  // (e.g. the hung connection this guards against finally errors). Attach a
  // no-op handler so that late rejection isn't surfaced as an unhandled
  // rejection. A rejection that arrives BEFORE the timeout still propagates via
  // the race below (race observes whichever settles first).
  guarded.catch(() => {})
  return Promise.race([guarded, timerPromise])
}
