'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GroupOption, StudentFilters } from '../types'

type Props = {
  filters: StudentFilters
  groups: GroupOption[]
}

const ALL = '__all__'

type Item = { value: string; label: string }

const STATUS_ITEMS = [
  { value: ALL, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const ROLE_ITEMS = [
  { value: ALL, label: 'All' },
  { value: 'admin', label: 'Admin' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'student', label: 'Student' },
]

type FilterSelectProps = {
  label: string
  placeholder: string
  value: string | undefined
  items: Item[]
  className: string
  onChange: (value: string | undefined) => void
}

function FilterSelect({
  label,
  placeholder,
  value,
  items,
  className,
  onChange,
}: Readonly<FilterSelectProps>) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => onChange(v === ALL || v === null ? undefined : v)}
      items={items}
    >
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} label={item.label}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function useFilterUpdater() {
  const router = useRouter()
  const searchParams = useSearchParams()
  return useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('page')
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/app/admin/students?${params.toString()}`)
    },
    [router, searchParams],
  )
}

/** Debounced push of the search box into the URL; skips the initial mount. */
function useDebouncedSearch(searchText: string, updateFilter: ReturnType<typeof useFilterUpdater>) {
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    const timer = setTimeout(() => {
      updateFilter('search', searchText.trim() || undefined)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText, updateFilter])
}

export function StudentFiltersBar({ filters, groups }: Readonly<Props>) {
  const router = useRouter()
  const [searchText, setSearchText] = useState(filters.search ?? '')
  const updateFilter = useFilterUpdater()
  useDebouncedSearch(searchText, updateFilter)
  const groupItems = [
    { value: ALL, label: 'All' },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-3">
      <FilterSelect
        label="Status"
        placeholder="All statuses"
        value={filters.status}
        items={STATUS_ITEMS}
        className="w-col-sm"
        onChange={(v) => updateFilter('status', v)}
      />
      <FilterSelect
        label="Role"
        placeholder="All roles"
        value={filters.role}
        items={ROLE_ITEMS}
        className="w-col-sm"
        onChange={(v) => updateFilter('role', v)}
      />
      <FilterSelect
        label="Group"
        placeholder="All groups"
        value={filters.group}
        items={groupItems}
        className="w-col-md"
        onChange={(v) => updateFilter('group', v)}
      />

      <Input
        type="search"
        placeholder="Search students..."
        aria-label="Search students"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        className="w-col-lg"
      />

      <Button variant="ghost" size="sm" onClick={() => router.push('/app/admin/students')}>
        Clear
      </Button>
    </div>
  )
}
