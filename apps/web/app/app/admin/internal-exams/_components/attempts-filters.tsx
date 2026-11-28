'use client'

import { FilterSelect } from '@/app/app/_components/filter-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ALL, type SelectKey, useAttemptFilters } from '../_hooks/use-attempt-filters'
import type { AttemptFilterOptions, AttemptUrlFilters } from '../types'

type Props = {
  filters: AttemptUrlFilters
  options: AttemptFilterOptions
}

type Item = { value: string; label: string }
type Spec = {
  key: SelectKey
  label: string
  all: string
  fallback: string
  width: string
  rows: Item[]
}

function specs(options: AttemptFilterOptions): Spec[] {
  return [
    {
      key: 'subject',
      label: 'Subject',
      all: 'All subjects',
      fallback: 'Selected subject',
      width: 'w-col-md',
      rows: options.subjects.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      key: 'sitting',
      label: 'Sitting',
      all: 'All sittings',
      fallback: 'Selected sitting',
      width: 'w-col-lg',
      rows: options.sittings.map((s) => ({ value: s.id, label: s.label })),
    },
    {
      key: 'group',
      label: 'Group',
      all: 'All groups',
      fallback: 'Selected group',
      width: 'w-col-md',
      rows: options.groups.map((g) => ({ value: g.id, label: g.name })),
    },
  ]
}

/** Options plus the "All" entry; a URL-selected id missing from the (capped) list stays selectable. */
function itemsOf(spec: Spec, selected: string | undefined): Item[] {
  const missing = selected && !spec.rows.some((r) => r.value === selected)
  return [
    { value: ALL, label: spec.all },
    ...spec.rows,
    ...(missing ? [{ value: selected, label: spec.fallback }] : []),
  ]
}

type SelectsProps = Props & { onChange: (key: SelectKey, value: string | null) => void }

function AttemptFilterSelects({ filters, options, onChange }: Readonly<SelectsProps>) {
  return (
    <>
      {specs(options).map((spec) => (
        <FilterSelect
          key={spec.key}
          value={filters[spec.key] ?? ALL}
          items={itemsOf(spec, filters[spec.key])}
          ariaLabel={spec.label}
          placeholder={spec.all}
          triggerClassName={spec.width}
          onValueChange={(v) => onChange(spec.key, v)}
        />
      ))}
    </>
  )
}

export function AttemptsFilters({ filters, options }: Readonly<Props>) {
  const { shown, search, onChange, clearAll } = useAttemptFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <AttemptFilterSelects filters={shown} options={options} onChange={onChange} />
      <Input
        type="search"
        placeholder="Search name or email..."
        aria-label="Search attempts"
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
