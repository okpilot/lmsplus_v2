'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { PaginationBar } from '@/app/app/_components/pagination-bar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { DashboardFilters, DashboardStudent } from '../types'
import { PAGE_SIZE } from '../types'
import { SortableHead, type SortField, StudentRow } from './student-table-helpers'

const SORTABLE_COLUMNS: { field: SortField; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'lastActive', label: 'Last Active' },
  { field: 'sessions', label: 'Sessions' },
  { field: 'avgScore', label: 'Avg Score' },
  { field: 'mastery', label: 'Mastery' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Students' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

type Props = Readonly<{
  students: DashboardStudent[]
  totalCount: number
  filters: DashboardFilters
}>

export function StudentTableShell({ students, totalCount, filters }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleStatusChange = useCallback(
    (value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('page')
      if (!value || value === 'all') {
        params.delete('status')
      } else {
        params.set('status', value)
      }
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams],
  )

  const handleSort = useCallback(
    (field: SortField) => {
      const nextDir = filters.sort === field && filters.dir === 'asc' ? 'desc' : 'asc'
      const params = new URLSearchParams(searchParams.toString())
      params.set('sort', field)
      params.set('dir', nextDir)
      params.delete('page')
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams, filters.sort, filters.dir],
  )

  const statusValue = filters.status ?? 'all'

  const statusFilter = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Filter:</span>
      <Select value={statusValue} onValueChange={handleStatusChange} items={STATUS_OPTIONS}>
        <SelectTrigger className="w-40" aria-label="Student status filter">
          <SelectValue placeholder="All Students" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} label={opt.label}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  if (students.length === 0) {
    return (
      <div className="space-y-3">
        {statusFilter}
        <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No students found.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {statusFilter}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {SORTABLE_COLUMNS.map((col) => (
                <SortableHead
                  key={col.field}
                  field={col.field}
                  label={col.label}
                  activeSort={filters.sort}
                  activeDir={filters.dir}
                  onSort={handleSort}
                />
              ))}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s) => (
              <StudentRow
                key={s.id}
                student={s}
                onClick={() => router.push(`/app/admin/dashboard/students/${s.id}`)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <PaginationBar
        page={filters.page}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        entityLabel="students"
      />
    </div>
  )
}
