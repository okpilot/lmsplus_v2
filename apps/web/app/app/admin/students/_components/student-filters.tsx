'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUpdateSearchParams } from '../../../_hooks/use-update-search-params'
import type { GroupOption, StudentFilters } from '../types'
import { StudentFilterSelects } from './student-filter-selects'

type Props = {
  filters: StudentFilters
  groups: GroupOption[]
}

type Update = ReturnType<typeof useUpdateSearchParams>

/** Search box: typing is debounced into the URL; the URL re-syncs the box unless typing is pending. */
function useSearchBox(urlSearch: string | undefined, update: Update) {
  const [text, setText] = useState(urlSearch ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => {
    if (!timer.current) {
      setText((prev) => (prev.trim() === (urlSearch ?? '') ? prev : (urlSearch ?? '')))
    }
  }, [urlSearch])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const onType = (v: string) => {
    setText(v)
    cancel()
    timer.current = setTimeout(() => {
      timer.current = null
      update({ search: v.trim() || null, page: null })
    }, 300)
  }
  const reset = () => {
    cancel()
    setText('')
  }
  const takePending = (): Record<string, string | null> => {
    if (!timer.current) return {}
    cancel()
    return { search: text.trim() || null }
  }
  return { text, onType, reset, takePending }
}

export function StudentFiltersBar({ filters, groups }: Readonly<Props>) {
  const update = useUpdateSearchParams()
  const search = useSearchBox(filters.search, update)
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
