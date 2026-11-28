'use client'

import { startTransition, useOptimistic } from 'react'
import { useSearchBox } from '@/app/app/_hooks/use-search-box'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import type { AttemptUrlFilters } from '../types'

export const ALL = '__all__'

export type SelectKey = 'subject' | 'sitting' | 'group'

export function useAttemptFilters(filters: AttemptUrlFilters) {
  const update = useUpdateSearchParams()
  const search = useSearchBox(filters.q, update, { key: 'q', pageKey: 'attemptsPage' })
  // Selects show the chosen value while the navigation is pending (Next guide: interactive-apps).
  const [shown, setShown] = useOptimistic(filters)
  const onChange = (key: SelectKey, v: string | null) => {
    const value = v === ALL ? undefined : (v ?? undefined)
    const pending = search.takePending()
    startTransition(() => {
      setShown({ ...shown, [key]: value })
      update({ [key]: value ?? null, ...pending, attemptsPage: null })
    })
  }
  const clearAll = () => {
    search.reset()
    startTransition(() => {
      setShown({})
      update({ q: null, subject: null, sitting: null, group: null, attemptsPage: null })
    })
  }
  return { shown, search, onChange, clearAll }
}
