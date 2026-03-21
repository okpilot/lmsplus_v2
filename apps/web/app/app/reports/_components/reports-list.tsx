'use client'

import { useState } from 'react'
import type { SessionReport } from '@/lib/queries/reports'
import { SessionCard } from './session-card'
import { SessionTable } from './session-table'

type SortKey = 'date' | 'score' | 'subject'
type SortDir = 'asc' | 'desc'

export function ReportsList({ sessions }: { sessions: SessionReport[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  if (sessions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No completed sessions yet. Start a quiz or review to see your reports.
      </p>
    )
  }

  const sorted = [...sessions].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'date')
      return dir * (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    if (sortKey === 'score') return dir * ((a.scorePercentage ?? 0) - (b.scorePercentage ?? 0))
    return dir * (a.subjectName ?? '').localeCompare(b.subjectName ?? '')
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'date' ? 'desc' : 'asc')
    }
  }

  const arrow = sortDir === 'asc' ? ' \u2191' : ' \u2193'

  return (
    <div>
      <div className="mb-3 flex gap-2 text-xs text-muted-foreground">
        <button type="button" onClick={() => toggleSort('date')} className="hover:text-foreground">
          Date{sortKey === 'date' ? arrow : ''}
        </button>
        <button type="button" onClick={() => toggleSort('score')} className="hover:text-foreground">
          Score{sortKey === 'score' ? arrow : ''}
        </button>
        <button
          type="button"
          onClick={() => toggleSort('subject')}
          className="hover:text-foreground"
        >
          Subject{sortKey === 'subject' ? arrow : ''}
        </button>
      </div>

      <div className="hidden rounded-lg border border-border md:block">
        <SessionTable sessions={sorted} />
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {sorted.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
      </div>
    </div>
  )
}
