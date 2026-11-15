'use client'

import { useEffect, useRef, useState } from 'react'
import { FilterSelect } from '@/app/app/_components/filter-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

type StudentFilterSelectProps = {
  label: string
  placeholder: string
  value: string | undefined
  items: Item[]
  className: string
  onChange: (value: string | undefined) => void
}

function StudentFilterSelect({
  label,
  placeholder,
  value,
  items,
  className,
  onChange,
}: Readonly<StudentFilterSelectProps>) {
  return (
    <FilterSelect
      value={value ?? ALL}
      items={items}
      ariaLabel={label}
      placeholder={placeholder}
      triggerClassName={className}
      onValueChange={(v) => onChange(v === ALL || v === null ? undefined : v)}
    />
  )
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
  return { text, onType, reset }
}

export function StudentFiltersBar({ filters, groups }: Readonly<Props>) {
  const update = useUpdateSearchParams()
  const updateFilter = (key: string, v: string | undefined) =>
    update({ [key]: v ?? null, page: null })
  const search = useSearchBox(filters.search, update)
  const groupItems = [
    { value: ALL, label: 'All' },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-3">
      <StudentFilterSelect
        label="Status"
        placeholder="All statuses"
        value={filters.status}
        items={STATUS_ITEMS}
        className="w-col-sm"
        onChange={(v) => updateFilter('status', v)}
      />
      <StudentFilterSelect
        label="Role"
        placeholder="All roles"
        value={filters.role}
        items={ROLE_ITEMS}
        className="w-col-sm"
        onChange={(v) => updateFilter('role', v)}
      />
      <StudentFilterSelect
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
        value={search.text}
        onChange={(e) => search.onType(e.target.value)}
        maxLength={200}
        className="w-col-lg"
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          search.reset()
          update({ status: null, role: null, group: null, search: null, page: null })
        }}
      >
        Clear
      </Button>
    </div>
  )
}
