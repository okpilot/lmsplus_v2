'use client'

import type { SessionReport } from '@/lib/queries/reports'
import Link from 'next/link'
import { useState } from 'react'

type ReportsListProps = {
  sessions: SessionReport[]
}

type SortKey = 'date' | 'score' | 'subject'
type SortDir = 'asc' | 'desc'

const MODE_LABELS: Record<string, string> = {
  smart_review: 'Smart Review',
  quick_quiz: 'Quiz',
  mock_exam: 'Mock Exam',
}

export function ReportsList({ sessions }: ReportsListProps) {
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
      <div className="mb-2 flex gap-2 text-xs text-muted-foreground">
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
      <div className="space-y-2">
        {sorted.map((session) => (
          <SessionReportRow key={session.id} session={session} />
        ))}
      </div>
    </div>
  )
}

function SessionReportRow({ session }: { session: SessionReport }) {
  const score =
    session.scorePercentage != null ? `${Math.round(session.scorePercentage)}%` : '\u2014'
  const date = new Date(session.startedAt)
  const dateStr = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Link
      href={`/app/quiz/report?session=${session.id}`}
      className="flex items-center justify-between rounded-md border border-border px-4 py-3 transition-colors hover:bg-accent"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {MODE_LABELS[session.mode] ?? session.mode}
          {session.subjectName ? ` \u2014 ${session.subjectName}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {session.correctCount}/{session.totalQuestions} correct
          {' \u00B7 '}
          {session.durationMinutes}min
          {' \u00B7 '}
          {dateStr}
        </p>
      </div>
      <span className="ml-3 text-sm font-semibold tabular-nums">{score}</span>
    </Link>
  )
}
