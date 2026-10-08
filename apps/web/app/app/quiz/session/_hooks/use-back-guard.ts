import { useEffect, useRef } from 'react'

const RELEASE_TIMEOUT_MS = 500

/** The armed sentinel's listener teardown; null while no guard is armed. One runner exists at a time. */
let armed: { remove: () => void } | null = null

/**
 * Pops the sentinel entry so a following `router.replace` leaves no dead entry behind. Resolves on
 * the browser's popstate, or after a timeout if it never reports one. A no-op when nothing is armed.
 */
export function releaseBackGuard(): Promise<void> {
  const current = armed
  if (!current) return Promise.resolve()
  armed = null
  current.remove()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      window.removeEventListener('popstate', done)
      resolve()
    }
    const timer = setTimeout(done, RELEASE_TIMEOUT_MS)
    window.addEventListener('popstate', done)
    window.history.back()
  })
}

/**
 * While `active`, pushes one sentinel history entry and turns every Back/Forward into `onAttempt`
 * by re-pushing the sentinel. `pushState` is given the current state and no url: Next's patched
 * `pushState` then keeps its tree state and `onPopState` does not reload.
 */
export function useBackGuard(active: boolean, onAttempt: () => void) {
  const attemptRef = useRef(onAttempt)
  attemptRef.current = onAttempt

  // Subscriptions only — no data fetching
  useEffect(() => {
    if (!active) return
    const push = () => window.history.pushState(window.history.state, '')
    const onPop = () => {
      push()
      attemptRef.current()
    }
    const mine = { remove: () => window.removeEventListener('popstate', onPop) }
    push()
    window.addEventListener('popstate', onPop)
    armed = mine
    return () => {
      mine.remove()
      if (armed === mine) armed = null
    }
  }, [active])

  return { release: releaseBackGuard }
}
