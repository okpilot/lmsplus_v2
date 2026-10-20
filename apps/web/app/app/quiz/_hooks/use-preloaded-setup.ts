import { type RefObject, useEffect, useRef } from 'react'
import { markHistoryRestore } from '../_utils/preloaded-discovery-count'
import type { PreloadPromise, StampedPreload } from '../types'

// Resolved values by promise: a remount (e.g. the Discovery <-> other-mode toggle) reads
// the value synchronously instead of waiting for a promise that already settled.
let popstateListening = false

const resolved = new WeakMap<PreloadPromise, StampedPreload>()

/**
 * Exposes the streamed server preload as a ref: `ref.current` is null until the promise
 * settles. Handlers read it at call time, so they never close over a stale snapshot and
 * a resolution never re-renders. The effect only subscribes to a promise the server
 * already started; nothing is fetched here.
 */
export function usePreloadedSetup(promise?: PreloadPromise): RefObject<StampedPreload | null> {
  const ref = useRef<StampedPreload | null>((promise && resolved.get(promise)) || null)
  useEffect(() => {
    if (!popstateListening) {
      popstateListening = true
      window.addEventListener('popstate', () => markHistoryRestore(Date.now()))
    }
    if (!promise) return
    let live = true
    const known = resolved.get(promise)
    if (known) ref.current = known
    promise.then(
      (value) => {
        // Stamp once: a remount reuses the first stamp, so the age is measured from load.
        const stamped = resolved.get(promise) ?? { ...value, loadedAt: Date.now() }
        resolved.set(promise, stamped)
        if (live) ref.current = stamped
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [promise])
  return ref
}
