import type * as React from 'react'

/** True for the nodes React renders as nothing a caller would want a wrapper for. `0` and `NaN` render. */
export function isEmptyNode(node: React.ReactNode): boolean {
  return node === null || node === undefined || node === false || node === ''
}
