'use client'

import { FilterSelect } from '@/app/app/_components/filter-select'
import { useSearchBox } from '@/app/app/_hooks/use-search-box'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AttemptFilterOptions, AttemptUrlFilters } from '../types'

const ALL = '__all__'

type Props = {
  filters: AttemptUrlFilters
  options: AttemptFilterOptions
}

type Item = { value: string; label: string }
type SelectKey = 'subject' | 'sitting' | 'group'
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
  const update = useUpdateSearchParams()
  const search = useSearchBox(filters.q, update, { key: 'q', pageKey: 'attemptsPage' })
  const onChange = (key: SelectKey, v: string | null) =>
    update({ [key]: v === ALL ? null : v, ...search.takePending(), attemptsPage: null })
  const clearAll = () => {
    search.reset()
    update({ q: null, subject: null, sitting: null, group: null, attemptsPage: null })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <AttemptFilterSelects filters={filters} options={options} onChange={onChange} />
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
