'use client'

import { FilterSelect } from '@/app/app/_components/filter-select'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { SHOW_OPTIONS } from '../_utils/person-rollup'
import type { ShowValue } from '../types'

/** Who to show; the server filters. Writes `show` (removed for All people) and drops `page`. */
export function ShowFilter({ value }: Readonly<{ value: ShowValue }>) {
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
        clearRoster()
        const draft = searchDraft?.current
        if (searchDraft) searchDraft.current = null
        update({
          show: v === 'all' || !v ? null : v,
          page: null,
          ...(draft == null ? {} : { q: draft.trim() || null }),
        })
      }}
    />
  )
}
