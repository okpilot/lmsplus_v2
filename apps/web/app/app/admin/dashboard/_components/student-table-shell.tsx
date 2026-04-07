'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { PaginationBar } from '@/app/app/_components/pagination-bar'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableTableHead } from '../_lib/sortable-head'
import type { DashboardFilters, DashboardStudent } from '../types'
import { STUDENTS_PAGE_SIZE } from '../types'
import { StudentStatusFilter } from './student-status-filter'
import { StudentRow } from './student-table-helpers'

const SORTABLE_COLUMNS: { field: DashboardFilters['sort']; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'lastActive', label: 'Last Active' },
  { field: 'sessions', label: 'Sessions' },
  { field: 'avgScore', label: 'Avg Score' },
  { field: 'mastery', label: 'Mastery' },
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
    (field: DashboardFilters['sort']) => {
      const nextDir = filters.sort === field && filters.dir === 'asc' ? 'desc' : 'asc'
      const params = new URLSearchParams(searchParams.toString())
      params.set('sort', field)
      params.set('dir', nextDir)
      params.delete('page')
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams, filters.sort, filters.dir],
  )

  const statusFilter = (
    <StudentStatusFilter value={filters.status ?? 'all'} onChange={handleStatusChange} />
  )

  if (totalCount === 0) {
    return (
      <div className="space-y-3">
        {statusFilter}
        <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No students found.
        </p>
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="space-y-3">
        {statusFilter}
        <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No students on this page. Try going back to page 1.
        </p>
        <PaginationBar
          page={filters.page}
          totalCount={totalCount}
          pageSize={STUDENTS_PAGE_SIZE}
          entityLabel="students"
        />
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
                <SortableTableHead
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
        pageSize={STUDENTS_PAGE_SIZE}
        entityLabel="students"
      />
    </div>
  )
}
