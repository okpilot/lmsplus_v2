'use client'

import { useCallback } from 'react'
import { PaginationBar } from '@/app/app/_components/pagination-bar'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
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

export function ReportsList({ sessions, page, totalCount, pageSize, sort, dir }: Readonly<Props>) {
  const updateParams = useUpdateSearchParams()

  const setSort = useCallback(
    (key: SortKey) => {
      if (sort === key) {
        updateParams({ dir: dir === 'asc' ? 'desc' : 'asc', page: null })
      } else {
        updateParams({ sort: key, dir: key === 'date' ? 'desc' : 'asc', page: null })
      }
    },
    [updateParams, sort, dir],
  )

  if (sessions.length === 0 && totalCount === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No completed sessions yet. Start a quiz or review to see your reports.
      </p>
    )
  }

  const arrow = dir === 'asc' ? ' \u2191' : ' \u2193'

  return (
    <div>
      <div className="mb-3 flex gap-2 text-xs text-muted-foreground">
        <button type="button" onClick={() => setSort('date')} className="hover:text-foreground">
          Date{sort === 'date' ? arrow : ''}
        </button>
        <button type="button" onClick={() => setSort('score')} className="hover:text-foreground">
          Score{sort === 'score' ? arrow : ''}
        </button>
        <button type="button" onClick={() => setSort('subject')} className="hover:text-foreground">
          Subject{sort === 'subject' ? arrow : ''}
        </button>
      </div>

      <div className="hidden rounded-lg border border-border md:block">
        <SessionTable sessions={sessions} />
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {sessions.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
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
