'use client'

import { Button } from '@/components/ui/button'
import { TableHead } from '@/components/ui/table'

export type SortableTableHeadProps<T extends string> = Readonly<{
  field: T
  label: string
  activeSort: T
  activeDir: 'asc' | 'desc'
  onSort: (field: T) => void
  className?: string
  align?: 'left' | 'right'
}>

export function SortableTableHead<T extends string>({
  field,
  label,
  activeSort,
  activeDir,
  onSort,
  className,
  align = 'left',
}: SortableTableHeadProps<T>) {
  const isActive = activeSort === field
  const indicator = isActive ? (activeDir === 'asc' ? ' ▲' : ' ▼') : ''
  const justify = align === 'right' ? 'justify-end' : 'justify-start'
  return (
    <TableHead
      className={className}
      aria-sort={isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Button
        variant="bare"
        className={`flex w-full cursor-pointer items-center text-muted-foreground transition-colors hover:text-foreground ${justify}`}
        onClick={() => onSort(field)}
      >
        {label}
        {indicator}
      </Button>
    </TableHead>
  )
}
