import type * as React from 'react'

/** True for nodes React renders as nothing a caller would want a wrapper for: nullish, booleans, `''`, and arrays of only such nodes. `0` and `NaN` render. */
export function isEmptyNode(node: React.ReactNode): boolean {
  if (Array.isArray(node)) return node.every(isEmptyNode)
  return node === null || node === undefined || typeof node === 'boolean' || node === ''
}
