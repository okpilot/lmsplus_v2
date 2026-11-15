'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateSearchParams } from '../../../_hooks/use-update-search-params'
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

type Update = ReturnType<typeof useUpdateSearchParams>

/** Debounced push of the search box into the URL; skips when the box already matches the URL. */
function useDebouncedSearch(searchText: string, urlSearch: string | undefined, update: Update) {
  useEffect(() => {
    if (searchText.trim() === (urlSearch ?? '')) return
    const timer = setTimeout(() => {
      update({ search: searchText.trim() || null, page: null })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText, urlSearch, update])
}

export function StudentFiltersBar({ filters, groups }: Readonly<Props>) {
  const [searchText, setSearchText] = useState(filters.search ?? '')
  const update = useUpdateSearchParams()
  const updateFilter = (key: string, v: string | undefined) =>
    update({ [key]: v ?? null, page: null })
  useDebouncedSearch(searchText, filters.search, update)
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

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setSearchText('')
          update({ status: null, role: null, group: null, search: null, page: null })
        }}
      >
        Clear
      </Button>
    </div>
  )
}
