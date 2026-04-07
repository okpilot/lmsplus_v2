'use client'

import { TableHead } from '@/components/ui/table'

export type SortableTableHeadProps<T extends string> = Readonly<{
  field: T
  label: string
  activeSort: T
  activeDir: 'asc' | 'desc'
  onSort: (field: T) => void
}>

export function SortableTableHead<T extends string>({
  field,
  label,
  activeSort,
  activeDir,
  onSort,
}: SortableTableHeadProps<T>) {
  const isActive = activeSort === field
  const indicator = isActive ? (activeDir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <TableHead aria-sort={isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center text-left select-none"
        onClick={() => onSort(field)}
      >
        {label}
        {indicator}
      </button>
    </TableHead>
  )
}
