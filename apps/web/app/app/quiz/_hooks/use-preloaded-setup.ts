import { type RefObject, useEffect, useRef } from 'react'
import type { PreloadPromise, QuizSetupPreload } from '../types'

// Resolved values by promise: a remount (e.g. the Discovery <-> other-mode toggle) reads
// the value synchronously instead of waiting for a promise that already settled.
const resolved = new WeakMap<PreloadPromise, QuizSetupPreload>()

/**
 * Exposes the streamed server preload as a ref: `ref.current` is null until the promise
 * settles. Handlers read it at call time, so they never close over a stale snapshot and
 * a resolution never re-renders. The effect only subscribes to a promise the server
 * already started; nothing is fetched here.
 */
export function usePreloadedSetup(promise?: PreloadPromise): RefObject<QuizSetupPreload | null> {
  const ref = useRef<QuizSetupPreload | null>((promise && resolved.get(promise)) || null)
  useEffect(() => {
    if (!promise) return
    let live = true
    const known = resolved.get(promise)
    if (known) ref.current = known
    promise.then(
      (value) => {
        resolved.set(promise, value)
        if (live) ref.current = value
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [promise])
  return ref
}
