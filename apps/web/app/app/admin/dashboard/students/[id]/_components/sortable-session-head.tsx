'use client'

import { TableHead } from '@/components/ui/table'
import type { SessionSort } from '../../../types'

type Props = Readonly<{
  field: SessionSort
  label: string
  activeSort: SessionSort
  activeDir: 'asc' | 'desc'
  onSort: (field: SessionSort) => void
}>

export function SortableSessionHead({ field, label, activeSort, activeDir, onSort }: Props) {
  const isActive = activeSort === field
  const indicator = isActive ? (activeDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''
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
