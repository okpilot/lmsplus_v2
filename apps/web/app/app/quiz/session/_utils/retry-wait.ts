export const BACKOFF_MS = [2000, 4000, 8000, 10000]

// Jobs sleeping in backoff; resumeQueue wakes them.
const wakers = new Set<() => void>()

export function clearRetryWaiters() {
  wakers.clear()
}

export function wakeRetryWaiters() {
  for (const wake of [...wakers]) wake()
}

/** Sleeps for the index-th backoff step, or until the browser reports it is online or a waker fires. */
export function waitForRetry(index: number): Promise<void> {
  const delay = BACKOFF_MS[Math.min(index, BACKOFF_MS.length - 1)]
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      window.removeEventListener('online', finish)
      wakers.delete(finish)
      resolve()
    }
    const timer = setTimeout(finish, delay)
    window.addEventListener('online', finish)
    wakers.add(finish)
  })
}
