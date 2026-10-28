'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SortableTableHead } from '@/components/sortable-table-head'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { type ExamMode, isExamMode, MODE_LABELS, modeLabel } from '@/lib/constants/exam-modes'
import { reportUrl } from '@/lib/constants/report-paths'
import type { SessionReport, SortDir, SortKey } from '@/lib/queries/reports'
import { formatCorrectFraction } from '@/lib/utils/format-correct-fraction'
import { scoreColor } from '@/lib/utils/score-color'
import { formatDate, formatDurationMinutes } from './reports-utils'

type Props = Readonly<{
  sessions: SessionReport[]
  sort: SortKey
  dir: SortDir
  onSort: (field: SortKey) => void
}>

export function SessionTable({ sessions, sort, dir, onSort }: Readonly<Props>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
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
          <TableHead className="px-4 py-3 text-xs text-muted-foreground">Mode</TableHead>
          <TableHead className="px-4 py-3 text-xs text-muted-foreground">Correct</TableHead>
          <TableHead className="px-4 py-3 text-xs text-muted-foreground">Time</TableHead>
          <SortableTableHead
            field="score"
            label="Score"
            activeSort={sort}
            activeDir={dir}
            onSort={onSort}
            className="px-4 py-3 text-xs"
            align="right"
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </TableBody>
    </Table>
  )
}

function SessionRow({ session: s }: Readonly<{ session: SessionReport }>) {
  const router = useRouter()
  const score = s.scorePercentage == null ? '\u2014' : `${Math.round(s.scorePercentage)}%`
  const color = s.scorePercentage == null ? undefined : scoreColor(s.scorePercentage)
  const href = reportUrl(s.mode, s.id, s.subjectCode)
  const navigate = () => router.push(href)

  return (
    <TableRow
      tabIndex={0}
      className="cursor-pointer hover:bg-accent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onClick={navigate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate()
        }
      }}
    >
      <TableCell className="px-4 py-3 whitespace-normal text-muted-foreground">
        {formatDate(s.startedAt)}
      </TableCell>
      <TableCell className="px-4 py-3 whitespace-normal font-medium">
        <Link href={href} prefetch={false} onClick={(e) => e.stopPropagation()}>
          {s.subjectName ?? '\u2014'}
        </Link>
      </TableCell>
      <TableCell className="px-4 py-3 whitespace-normal">
        {isExamMode(s.mode) ? (
          <ExamBadge mode={s.mode} />
        ) : (
          <span className="text-muted-foreground">{modeLabel(s.mode)}</span>
        )}
      </TableCell>
      <TableCell className="px-4 py-3 whitespace-normal tabular-nums">
        {formatCorrectFraction(s.correctCount, s.answeredItems)}
      </TableCell>
      <TableCell className="px-4 py-3 whitespace-normal text-muted-foreground">
        {formatDurationMinutes(s.durationMinutes)}
      </TableCell>
      <TableCell
        className="px-4 py-3 whitespace-normal text-right font-semibold tabular-nums"
        style={{ color }}
      >
        {score}
      </TableCell>
    </TableRow>
  )
}

function ExamBadge({ mode }: Readonly<{ mode: ExamMode }>) {
  return (
    <Badge tone="caution" className="uppercase tracking-wide">
      {MODE_LABELS[mode]}
    </Badge>
  )
}
