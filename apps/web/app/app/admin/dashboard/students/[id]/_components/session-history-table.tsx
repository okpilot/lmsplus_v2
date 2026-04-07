'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { PaginationBar } from '@/app/app/_components/pagination-bar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { SessionSort, StudentSession, StudentSessionFilters } from '../../../types'
import { PAGE_SIZE } from '../../../types'
import { SessionRangeHeader } from './session-range-header'
import { formatDate, formatDuration } from './session-table-helpers'
import { SortableSessionHead } from './sortable-session-head'

export function SessionHistoryTable({
  sessions,
  totalCount,
  filters,
}: Readonly<{ sessions: StudentSession[]; totalCount: number; filters: StudentSessionFilters }>) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSort = useCallback(
    (field: SessionSort) => {
      const nextDir = filters.sort === field && filters.dir === 'desc' ? 'asc' : 'desc'
      const params = new URLSearchParams(searchParams.toString())
      params.set('sort', field)
      params.set('dir', nextDir)
      params.delete('page')
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams, filters.sort, filters.dir],
  )

  const handleRangeChange = useCallback(
    (value: string | null) => {
      if (!value) return
      const params = new URLSearchParams(searchParams.toString())
      if (value === '30d') params.delete('range')
      else params.set('range', value)
      params.delete('page')
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams],
  )

  const header = <SessionRangeHeader range={filters.range} onRangeChange={handleRangeChange} />

  if (totalCount === 0) {
    return (
      <div className="space-y-3">
        {header}
        <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No sessions found.
        </p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No sessions on this page. Try going back to page 1.
        </p>
        <PaginationBar
          page={filters.page}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          entityLabel="sessions"
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {header}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableSessionHead
                field="date"
                label="Date"
                activeSort={filters.sort}
                activeDir={filters.dir}
                onSort={handleSort}
              />
              <TableHead>Subject</TableHead>
              <TableHead>Topic</TableHead>
              <SortableSessionHead
                field="mode"
                label="Mode"
                activeSort={filters.sort}
                activeDir={filters.dir}
                onSort={handleSort}
              />
              <SortableSessionHead
                field="score"
                label="Score"
                activeSort={filters.sort}
                activeDir={filters.dir}
                onSort={handleSort}
              />
              <SortableSessionHead
                field="questions"
                label="Questions"
                activeSort={filters.sort}
                activeDir={filters.dir}
                onSort={handleSort}
              />
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.sessionId}>
                <TableCell>{formatDate(s.endedAt)}</TableCell>
                <TableCell>{s.subjectName ?? '\u2014'}</TableCell>
                <TableCell>{s.topicName ?? '\u2014'}</TableCell>
                <TableCell className="capitalize">{s.mode}</TableCell>
                <TableCell>
                  {s.scorePercentage !== null ? `${s.scorePercentage}%` : '\u2014'}
                </TableCell>
                <TableCell>
                  {s.correctCount}/{s.totalQuestions}
                </TableCell>
                <TableCell>{formatDuration(s.startedAt, s.endedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PaginationBar
        page={filters.page}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
        entityLabel="sessions"
      />
    </div>
  )
}
