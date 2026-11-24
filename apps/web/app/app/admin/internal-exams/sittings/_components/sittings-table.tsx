'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatListDate } from '../_utils/format-dates'
import { plural } from '../_utils/plural'
import { SITTING_BASE, type SittingRow } from '../types'
import { modeLabel, statusLabel } from './sitting-labels'

const ROW_CLASS =
  'cursor-pointer hover:bg-accent focus-visible:outline focus-visible:outline-focus focus-visible:-outline-offset-focus focus-visible:outline-ring'

/** "13 exams · 1 needs a code" while editable; "4 exams · 3 finished · 1 absent" once closed. */
export function examsText(r: SittingRow): string {
  const base = plural(r.entries, 'exam')
  if (r.status === 'closed')
    return `${base} · ${r.entriesFinished} finished · ${r.entriesAbsent} absent`
  if (r.status === 'cancelled' || r.entriesWithoutCode === 0) return base
  return `${base} · ${r.entriesWithoutCode} ${r.entriesWithoutCode === 1 ? 'needs a code' : 'need a code'}`
}

export function SittingsTable({ rows }: Readonly<{ rows: SittingRow[] }>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date (UTC)</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>Invigilator</TableHead>
          <TableHead>People</TableHead>
          <TableHead>Exams</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <SittingRowView key={r.id} r={r} />
        ))}
      </TableBody>
    </Table>
  )
}

function SittingRowView({ r }: Readonly<{ r: SittingRow }>) {
  const router = useRouter()
  const href = `${SITTING_BASE}/${r.id}`
  const go = () => router.push(href)
  return (
    <TableRow
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter') go()
      }}
      className={ROW_CLASS}
    >
      <TableCell>
        <Link
          href={href}
          prefetch={false}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="font-medium text-foreground no-underline focus-visible:underline"
        >
          {formatListDate(r.scheduledAt)}
        </Link>
      </TableCell>
      <TableCell>{statusLabel(r.status)}</TableCell>
      <TableCell>{modeLabel(r.mode)}</TableCell>
      <TableCell>
        {r.invigilatorName}
        {!r.invigilatorActive && <span className="text-muted-foreground"> (inactive)</span>}
      </TableCell>
      <TableCell className="tabular-nums">{r.candidates}</TableCell>
      <TableCell>{examsText(r)}</TableCell>
    </TableRow>
  )
}
