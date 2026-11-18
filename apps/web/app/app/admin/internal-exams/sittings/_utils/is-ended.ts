import type { Ended } from '../types'

/** A popup read answered `{ ended: true }` (closed sitting or day over). */
export function isEnded(x: unknown): x is Ended {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && 'ended' in x
}

/** The popup has nothing to show: the sitting is gone (null) or ended. */
export function isGone(x: unknown): x is Ended | null {
  return x === null || isEnded(x)
}
