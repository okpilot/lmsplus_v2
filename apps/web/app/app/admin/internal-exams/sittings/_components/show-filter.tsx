'use client'

import { FilterSelect } from '@/app/app/_components/filter-select'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { SHOW_OPTIONS } from '../_utils/person-rollup'
import type { ShowValue } from '../types'

/** Who to show; the server filters. Writes `show` (removed for All people) and drops `page`. */
export function ShowFilter({ value, q }: Readonly<{ value: ShowValue; q: string }>) {
  const update = useUpdateSearchParams()
  const { clearRoster, searchDraft } = useSittingUi()
  return (
    <FilterSelect
      value={value}
      items={[...SHOW_OPTIONS]}
      ariaLabel="Show"
      placeholder="Show"
      triggerClassName="w-col-md"
      onValueChange={(v) => {
        const draft = searchDraft?.current
        if (searchDraft) searchDraft.current = null
        // Base UI fires this on every item press, the current one included. An unchanged filter
        // moves no rows, so the ticks stay unless a pending search draft moves them.
        if (v === value) {
          if (draft == null || draft.trim() === q) return
          clearRoster()
          update({ q: draft.trim() || null, page: null })
          return
        }
        clearRoster()
        update({
          show: v === 'all' || !v ? null : v,
          page: null,
          ...(draft == null ? {} : { q: draft.trim() || null }),
        })
      }}
    />
  )
}
