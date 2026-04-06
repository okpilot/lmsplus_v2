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
import { formatDate, formatDuration, SORTABLE_COLUMNS } from './session-table-helpers'

const TIME_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

type Props = Readonly<{
  sessions: StudentSession[]
  totalCount: number
  filters: StudentSessionFilters
}>

export function SessionHistoryTable({ sessions, totalCount, filters }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSort = useCallback(
    (field: SessionSort) => {
      // Default to desc (newest-first) — intentionally differs from student table (alpha asc)
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
      if (value === '30d') {
        params.delete('range')
      } else {
        params.set('range', value)
      }
      params.delete('page')
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams],
  )

  const rangeFilter = (
    <Select value={filters.range} onValueChange={handleRangeChange} items={TIME_RANGE_OPTIONS}>
      <SelectTrigger className="w-40" aria-label="Time range">
        <SelectValue placeholder="Select range" />
      </SelectTrigger>
      <SelectContent>
        {TIME_RANGE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} label={opt.label}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const header = (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">Session History</h2>
      {rangeFilter}
    </div>
  )

  if (sessions.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No sessions found.
        </p>
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
              {SORTABLE_COLUMNS.map((col) => {
                const arrow =
                  filters.sort === col.field ? (filters.dir === 'asc' ? ' \u25B2' : ' \u25BC') : ''
                return (
                  <TableHead
                    key={col.field}
                    className="cursor-pointer select-none"
                    onClick={() => handleSort(col.field)}
                  >
                    {col.label}
                    {arrow}
                  </TableHead>
                )
              })}
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
