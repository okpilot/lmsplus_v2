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
  return Promise.race([promise.finally(() => clearTimeout(timerId)), timerPromise])
}
