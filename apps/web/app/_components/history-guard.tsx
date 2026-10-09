'use client'

import { useLayoutEffect } from 'react'
import { installHistoryGuard } from '@/lib/history-guard'

/** Installs the history interceptor before Next's passive effects register their own history hooks. */
export function HistoryGuard() {
  useLayoutEffect(() => {
    installHistoryGuard()
  }, [])
  return null
}
