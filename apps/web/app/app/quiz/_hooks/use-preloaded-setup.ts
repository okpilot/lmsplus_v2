import { type RefObject, useEffect, useRef, useState } from 'react'
import type { PreloadPromise, QuizSetupPreload } from '../types'

// Resolved values by promise: a remount (e.g. the Discovery <-> other-mode toggle) reads
// the value synchronously instead of waiting for a promise that already settled.
const resolvedValues = new WeakMap<PreloadPromise, QuizSetupPreload>()

/**
 * Exposes the streamed server preload as a ref: `ref.current` is null until the promise
 * settles. Handlers read it at call time, so they never close over a stale snapshot.
 * `resolved` is the last promise whose value landed in the ref; it changes once per
 * resolution (one re-render), so effects can re-run when a refreshed preload arrives.
 * The effect only subscribes to a promise the server already started; nothing is fetched here.
 */
export function usePreloadedSetup(promise?: PreloadPromise): {
  ref: RefObject<QuizSetupPreload | null>
  resolved: PreloadPromise | null
} {
  const known = promise && resolvedValues.get(promise)
  const ref = useRef<QuizSetupPreload | null>(known || null)
  const [resolved, setResolved] = useState<PreloadPromise | null>(known ? promise : null)
  useEffect(() => {
    if (!promise) return
    let live = true
    const cached = resolvedValues.get(promise)
    if (cached) {
      ref.current = cached
      setResolved(promise)
    }
    promise.then(
      (value) => {
        resolvedValues.set(promise, value)
        if (!live) return
        ref.current = value
        setResolved(promise)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [promise])
  return { ref, resolved }
}
