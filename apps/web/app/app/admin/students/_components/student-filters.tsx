'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSearchBox } from '../../../_hooks/use-search-box'
import { useUpdateSearchParams } from '../../../_hooks/use-update-search-params'
import type { GroupOption, StudentFilters } from '../types'
import { StudentFilterSelects } from './student-filter-selects'

type Props = {
  filters: StudentFilters
  groups: GroupOption[]
}

export function StudentFiltersBar({ filters, groups }: Readonly<Props>) {
  const update = useUpdateSearchParams()
  const search = useSearchBox(filters.search, update, { key: 'search', pageKey: 'page' })
  const updateFilter = (key: string, v: string | undefined) =>
    update({ [key]: v ?? null, ...search.takePending(), page: null })
  const clearAll = () => {
    search.reset()
    update({ status: null, role: null, group: null, search: null, page: null })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <StudentFilterSelects filters={filters} groups={groups} updateFilter={updateFilter} />

      <Input
        type="search"
        placeholder="Search students..."
        aria-label="Search students"
        value={search.text}
        onChange={(e) => search.onType(e.target.value)}
        maxLength={200}
        className="w-col-lg"
      />

      <Button variant="ghost" size="sm" onClick={clearAll}>
        Clear
      </Button>
    </div>
  )
}
