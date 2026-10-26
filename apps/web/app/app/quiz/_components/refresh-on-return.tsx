'use client'

import { useRefreshOnReturn } from '../_hooks/use-refresh-on-return'

/** Page-level mount so every tab (New and Saved) refreshes on return. */
export function RefreshOnReturn() {
  useRefreshOnReturn()
  return null
}
