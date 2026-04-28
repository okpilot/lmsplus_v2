'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SortableTableHead } from '@/app/app/admin/dashboard/_lib/sortable-head'
import type { SessionReport, SortDir, SortKey } from '@/lib/queries/reports'
import { scoreColor } from '@/lib/utils/score-color'
import { formatDate, MODE_LABELS } from './reports-utils'

type Props = Readonly<{
  sessions: SessionReport[]
  sort: SortKey
  dir: SortDir
  onSort: (field: SortKey) => void
}>

export function SessionTable({ sessions, sort, dir, onSort }: Props) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <SortableTableHead
            field="date"
            label="Date"
            activeSort={sort}
            activeDir={dir}
            onSort={onSort}
            className="px-4 py-3 text-xs"
          />
          <SortableTableHead
            field="subject"
            label="Subject"
            activeSort={sort}
            activeDir={dir}
            onSort={onSort}
            className="px-4 py-3 text-xs"
          />
          <th className="px-4 py-3 text-left font-medium">Mode</th>
          <th className="px-4 py-3 text-left font-medium">Correct</th>
          <th className="px-4 py-3 text-left font-medium">Time</th>
          <SortableTableHead
            field="score"
            label="Score"
            activeSort={sort}
            activeDir={dir}
            onSort={onSort}
            className="px-4 py-3 text-xs"
            align="right"
          />
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </tbody>
    </table>
  )
}

function SessionRow({ session: s }: Readonly<{ session: SessionReport }>) {
  const router = useRouter()
  const exam = s.mode === 'mock_exam'
  const score = s.scorePercentage == null ? '\u2014' : `${Math.round(s.scorePercentage)}%`
  const color = s.scorePercentage == null ? undefined : scoreColor(s.scorePercentage)
  const href = `/app/quiz/report?session=${s.id}`
  const navigate = () => router.push(href)

  return (
    <tr
      tabIndex={0}
      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      onClick={navigate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate()
        }
      }}
    >
      <td className="px-4 py-3 text-muted-foreground">{formatDate(s.startedAt)}</td>
      <td className="px-4 py-3 font-medium">
        <Link href={href} onClick={(e) => e.stopPropagation()}>
          {s.subjectName ?? '\u2014'}
        </Link>
      </td>
      <td className="px-4 py-3">
        {exam ? (
          <ExamBadge />
        ) : (
          <span className="text-muted-foreground">{MODE_LABELS[s.mode] ?? s.mode}</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {s.correctCount} / {s.totalQuestions}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{s.durationMinutes}m</td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color }}>
        {score}
      </td>
    </tr>
  )
}

function ExamBadge() {
  return (
    <span className="inline-block rounded-sm border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-amber-600">
      {MODE_LABELS.mock_exam}
    </span>
  )
}
