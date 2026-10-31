'use client'

import { useCallback } from 'react'
import { PaginationBar } from '@/app/app/_components/pagination-bar'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import { CardList } from '@/components/ui/card'
import { EmptyNote } from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SessionReport, SortDir, SortKey } from '@/lib/queries/reports'
import { SessionCard } from './session-card'
import { SessionTable } from './session-table'

type Props = {
  sessions: SessionReport[]
  page: number
  totalCount: number
  pageSize: number
  sort: SortKey
  dir: SortDir
}

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Date (newest)' },
  { value: 'date-asc', label: 'Date (oldest)' },
  { value: 'score-desc', label: 'Score (high–low)' },
  { value: 'score-asc', label: 'Score (low–high)' },
  { value: 'subject-asc', label: 'Subject (A–Z)' },
  { value: 'subject-desc', label: 'Subject (Z–A)' },
]

function NoReports() {
  return (
    <EmptyNote>No completed sessions yet. Start a quiz or review to see your reports.</EmptyNote>
  )
}

export function ReportsList({ sessions, page, totalCount, pageSize, sort, dir }: Readonly<Props>) {
  const updateParams = useUpdateSearchParams()

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sort === key) {
        updateParams({ dir: dir === 'asc' ? 'desc' : 'asc', page: null })
      } else {
        updateParams({ sort: key, dir: key === 'date' ? 'desc' : 'asc', page: null })
      }
    },
    [updateParams, sort, dir],
  )

  const handleMobileSort = useCallback(
    (value: string | null) => {
      if (!value) return
      const [key, direction] = value.split('-') as [SortKey, SortDir]
      updateParams({ sort: key, dir: direction, page: null })
    },
    [updateParams],
  )

  if (sessions.length === 0 && totalCount === 0) {
    return <NoReports />
  }

  return (
    <div>
      <p className="mb-2 hidden text-caption text-muted-foreground md:block">
        Click a column header to sort
      </p>
      <div className="hidden md:block">
        <SessionTable sessions={sessions} sort={sort} dir={dir} onSort={handleSort} />
      </div>

      <div className="md:hidden">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-caption text-muted-foreground">Sort by</span>
          <Select value={`${sort}-${dir}`} onValueChange={handleMobileSort} items={SORT_OPTIONS}>
            <SelectTrigger size="sm" aria-label="Sort sessions">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {sessions.length > 0 && (
          <CardList>
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </CardList>
        )}
      </div>

      <PaginationBar
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        entityLabel="sessions"
      />
    </div>
  )
}
